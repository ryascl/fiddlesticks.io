
/**
 * The singleton Store controls all application state.
 * No parts outside of the Store modify application state.
 * Communication with the Store is done through message Channels: 
 *   - Actions channel to send into the Store,
 *   - Events channel to receive notification from the Store.
 * Only the Store can receive action messages.
 * Only the Store can send event messages.
 * The Store cannot send actions or listen to events (to avoid loops).
 * Messages are to be treated as immutable.
 * All mentions of the Store can be assumed to mean, of course,
 *   "The Store and its sub-components."
 */
class Store {

    static BROWSER_ID_KEY = "browserId";
    static FALLBACK_FONT_URL = 'fonts/Roboto-500.ttf';
    static DEFAULT_FONT_NAME = "Roboto";
    static FONT_LIST_LIMIT = 100;
    static SKETCH_LOCAL_CACHE_KEY = "fiddlesticks.io.lastSketch";
    static LOCAL_CACHE_DELAY_MS = 1000;
    static SERVER_SAVE_DELAY_MS = 10000;

    state: AppState = {};
    resources = {
        fallbackFont: opentype.Font,
        fontFamilies: new FontFamilies(),
        parsedFonts: new ParsedFonts((url, font) =>
            this.events.app.fontLoaded.dispatch(font))
    };
    router: AppRouter;
    actions = new Actions();
    events = new Events();

    private _sketchContent$ = new Rx.Subject<Sketch>();

    constructor(router: AppRouter) {
        this.router = router;

        this.setupState();

        this.setupSubscriptions();

        this.loadResources();
    }

    setupState() {
        this.state.browserId = Cookies.get(Store.BROWSER_ID_KEY);
        if(!this.state.browserId){
            this.state.browserId = newid();
            Cookies.set(Store.BROWSER_ID_KEY, this.state.browserId, { expires: 2 * 365 });
        }
    }

    setupSubscriptions() {
        const actions = this.actions, events = this.events;

        // ----- App -----

        actions.app.initWorkspace.observe()
            .pausableBuffered(events.app.resourcesReady.observe().map(m => m.data))
            .subscribe(m => {
                const sketchIdParam = this.sketchIdUrlParam;
                if (sketchIdParam) {
                    S3Access.getFile(sketchIdParam + ".json")
                        .done(sketch => {
                            this.loadSketch(sketch);
                            
                            console.log("Retrieved sketch", sketch._id); 
                            if(sketch.browserId === this.state.browserId) {
                                console.log('Sketch was created in this browser');
                            }
                            else {
                                console.log('Sketch was created in a different browser');
                            }

                            events.app.workspaceInitialized.dispatch(this.state.sketch);
                        })
                        .fail(err => {
                            console.warn("error getting remote sketch", err);
                            this.loadSketch(this.createSketch());
                            events.app.workspaceInitialized.dispatch(this.state.sketch);
                        });
                } else {
                    this.loadSketch(this.createSketch());
                }

                /* --- Set up sketch state watched --- */

                // this._sketchContent$
                //     .debounce(Store.LOCAL_CACHE_DELAY_MS)
                //     .subscribe(rs => {
                //         if (!localStorage || !localStorage.getItem) {
                //             // not supported
                //             return;
                //         }
                //         localStorage.setItem(
                //             Store.SKETCH_LOCAL_CACHE_KEY,
                //             JSON.stringify(this.state.sketch));
                //     });

                this._sketchContent$.debounce(Store.SERVER_SAVE_DELAY_MS)
                    .subscribe(sketch => {
                        if (sketch && sketch._id && sketch.textBlocks.length) {
                            this.saveSketch(sketch);
                        }
                    });
            });

        actions.app.loadFont.subscribe(m =>
            this.resources.parsedFonts.get(m.data));

        // ----- Designer -----

        actions.designer.zoomToFit.forward(
            events.designer.zoomToFitRequested);

        actions.designer.exportPNG.subscribe(m => {
            this.setSelection(null);
            this.setEditingItem(null);
            events.designer.exportPNGRequested.dispatch(m.data);
        });

        actions.designer.exportSVG.subscribe(m => {
            this.setSelection(null);
            this.setEditingItem(null);
            events.designer.exportSVGRequested.dispatch(m.data);
        });

        actions.designer.viewChanged.subscribe(m => {
            events.designer.viewChanged.dispatch(m.data);
        });

        actions.designer.updateSnapshot.subscribe(m => {
            if (m.data.sketch._id) {
                const filename = m.data.sketch._id + ".png";
                const blob = DomHelpers.dataURLToBlob(m.data.pngDataUrl);
                S3Access.putFile(filename, "image/png", blob);
            }
        });

        // ----- Sketch -----

        actions.sketch.create
            .subscribe((m) => {
                const sketch = this.createSketch();

                const patch: SketchAttr = m.data || {};
                patch.backgroundColor = patch.backgroundColor || '#f6f3eb';
                this.assign(sketch, patch);

                this.loadSketch(sketch)

                this.resources.parsedFonts.get(this.state.sketch.defaultTextBlockAttr.fontFamily);

                this.setEditingItem(null);

                this.changedSketch();
            });

        actions.sketch.attrUpdate
            .subscribe(ev => {
                this.assign(this.state.sketch, ev.data);
                events.sketch.attrChanged.dispatch(
                    this.state.sketch);
                this.changedSketch();
            });

        actions.sketch.setSelection.subscribe(m => {
            this.setSelection(m.data);
            this.setEditingItem(m.data);
        });


        // ----- TextBlock -----

        actions.textBlock.add
            .subscribe(ev => {
                this.setEditingItem(null);

                let patch = ev.data;
                if (!patch.text || !patch.text.length) {
                    return;
                }
                let block = { _id: newid() } as TextBlock;
                this.assign(block, patch);

                if (!block.textColor) {
                    block.textColor = this.state.sketch.defaultTextBlockAttr.textColor;
                }
                
                if(!block.fontFamily){
                    block.fontFamily = this.state.sketch.defaultTextBlockAttr.fontFamily;    
                    block.fontVariant = this.state.sketch.defaultTextBlockAttr.fontVariant;    
                }
                                
                this.state.sketch.textBlocks.push(block);
                events.textblock.added.dispatch(block);
                this.changedSketch();
                
                this.loadTextBlockFont(block);
            });

        actions.textBlock.updateAttr
            .subscribe(ev => {
                let block = this.getBlock(ev.data._id);
                if (block) {
                    let patch = <TextBlock>{
                        text: ev.data.text,
                        backgroundColor: ev.data.backgroundColor,
                        textColor: ev.data.textColor,
                        fontFamily: ev.data.fontFamily,
                        fontVariant: ev.data.fontVariant
                    };
                    const fontChanged = patch.fontFamily !== block.fontFamily
                        || patch.fontVariant !== block.fontVariant;
                    this.assign(block, patch);
                                       
                    if(block.fontFamily && !block.fontVariant){
                        const famDef = this.resources.fontFamilies.get(block.fontFamily);
                        if(famDef){
                            // regular or else first variant
                            block.fontVariant = this.resources.fontFamilies.defaultVariant(famDef);
                        }
                    }
                    
                    this.state.sketch.defaultTextBlockAttr = _.clone(block);
                                       
                    events.textblock.attrChanged.dispatch(block);
                    this.changedSketch();
                    
                    if(fontChanged){
                        this.loadTextBlockFont(block);
                    }
                }
            });

        actions.textBlock.remove
            .subscribe(ev => {
                let didDelete = false;
                _.remove(this.state.sketch.textBlocks, tb => {
                    if (tb._id === ev.data._id) {
                        didDelete = true;
                        return true;
                    }
                });
                if (didDelete) {
                    events.textblock.removed.dispatch({ _id: ev.data._id });
                    this.changedSketch();
                    this.setEditingItem(null);
                }
            });

        actions.textBlock.updateArrange
            .subscribe(ev => {
                let block = this.getBlock(ev.data._id);
                if (block) {
                    block.position = ev.data.position;
                    block.outline = ev.data.outline;
                    events.textblock.arrangeChanged.dispatch(block);
                    this.changedSketch();
                }
            });
    }

    private loadSketch(sketch: Sketch) {
        this.state.loadingSketch = true;
        this.state.sketch = sketch;
        this.sketchIdUrlParam = sketch._id;
        this.events.sketch.loaded.dispatch(this.state.sketch);
        for (const tb of this.state.sketch.textBlocks) {
            this.events.textblock.loaded.dispatch(tb);
        }
        this.events.designer.zoomToFitRequested.dispatch();
        this.state.loadingSketch = false;
    }

    private loadResources() {
        this.resources.fontFamilies.loadCatalogLocal(families => {
            // load fonts into browser for preview
            this.resources.fontFamilies.loadPreviewSubsets(families.map(f => f.family));

            this.resources.parsedFonts.get(
                Store.FALLBACK_FONT_URL, 
                (url, font) => this.resources.fallbackFont = font);

            this.events.app.resourcesReady.dispatch(true);
        });
    }

    private showUserMessage(message: string){
        this.state.userMessage = message;
        this.events.designer.userMessageChanged.dispatch(message);
        setTimeout(() => {
            this.state.userMessage = null;
            this.events.designer.userMessageChanged.dispatch(null);
        }, 3000)
    }

    private loadTextBlockFont(block: TextBlock){
        this.resources.parsedFonts.get(
            this.resources.fontFamilies.getUrl(block.fontFamily, block.fontVariant),
            (url, font) => this.events.textblock.fontReady.dispatch(
                {textBlockId: block._id, font: font})
        );
    }

    private changedSketch() {
        this.events.sketch.contentChanged.dispatch(this.state.sketch);
        this._sketchContent$.onNext(this.state.sketch);
    }

    private assign<T>(dest: T, source: T) {
        _.merge(dest, source);
    }

    private createSketch(): Sketch {
        return {
            _id: newid(),
            browserId: this.state.browserId,
            defaultTextBlockAttr: {
                fontFamily: "Roboto",
                fontVariant: "regular",
                textColor: "lightgray"
            },
            textBlocks: <TextBlock[]>[]
        };
    }

    private get sketchIdUrlParam(): string {
        const routeState = <RouteState>this.router.getState();
        return routeState.params.sketchId;
    }

    private set sketchIdUrlParam(value: string) {
        this.router.navigate("sketch", { sketchId: value });
    }

    private saveSketch(sketch: Sketch) {
        S3Access.putFile(sketch._id + ".json",
            "application/json", JSON.stringify(sketch));
        this.showUserMessage("Saved");
        this.events.designer.snapshotExpired.dispatch(sketch);
    }

    private setSelection(item: WorkspaceObjectRef) {
        // early exit on no change
        if (item) {
            if (this.state.selection
                && this.state.selection.itemId === item.itemId) {
                return;
            }
        } else {
            if (!this.state.selection) {
                return;
            }
        }

        this.state.selection = item;
        this.events.sketch.selectionChanged.dispatch(item);
    }

    private setEditingItem(item: PositionedObjectRef) {
        // early exit on no change
        if (item) {
            if (this.state.editingItem
                && this.state.editingItem.itemId === item.itemId) {
                return;
            }
        } else {
            if (!this.state.editingItem) {
                return;
            }
        }

        if (this.state.editingItem) {
            // signal closing editor for item

            if (this.state.editingItem.itemType === "TextBlock") {
                const currentEditingBlock = this.getBlock(this.state.editingItem.itemId);
                if (currentEditingBlock) {
                    this.events.textblock.editorClosed.dispatch(currentEditingBlock);
                }
            }
        }

        if (item) {
            // editing item should be selected item
            this.setSelection(item);
        }

        this.state.editingItem = item;
        this.events.sketch.editingItemChanged.dispatch(item);
    }

    private getBlock(id: string) {
        return _.find(this.state.sketch.textBlocks, tb => tb._id === id);
    }
}
