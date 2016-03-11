
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

    static ROBOTO_500_LOCAL = 'fonts/Roboto-500.ttf';
    static DEFAULT_FONT_NAME = "Roboto";
    static FONT_LIST_LIMIT = 100;
    static SKETCH_LOCAL_CACHE_KEY = "fiddlesticks.io.lastSketch";
    static LOCAL_CACHE_DELAY_MS = 1000;
    static SERVER_SAVE_DELAY_MS = 5000;

    state: AppState = {};
    resources = {
        fontFamilies: <Dictionary<FontFamily>>{},
        parsedFonts: new ParsedFonts((url, font) =>
            this.events.app.fontLoaded.dispatch(font))
    };
    router: AppRouter;
    actions = new Actions();
    events = new Events();

    private _sketchContent$ = new Rx.Subject<Sketch>();

    constructor(router: AppRouter) {
        this.router = router;
        
        this.setupSubscriptions();

        this.loadResources();
    }

    setupSubscriptions() {
        const actions = this.actions, events = this.events;

        // ----- App -----

        actions.app.initWorkspace.observe()
            // Warning: subscribing to event within Store - crazy or not??
            // wait to load until resources are ready
            .pausableBuffered(events.app.resourcesReady.observe().map(m => m.data))
            .subscribe(m => {
                const sketchIdParam = this.sketchIdUrlParam;
                if(sketchIdParam){
                    S3Access.getFile(sketchIdParam + ".json")
                        .done(sketch => {
                            this.loadSketch(sketch);
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
                            S3Access.putFile(sketch._id + ".json",
                                "application/json", JSON.stringify(sketch));
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
            // Can't do this, due to chance of accidental closing   
            // this.setEditingItem(null);
            events.designer.viewChanged.dispatch(m.data);
        });

        // ----- Sketch -----

        actions.sketch.create
            .subscribe((m) => {
                const sketch = this.createSketch();

                const patch = m.data || {};
                patch.backgroundColor = patch.backgroundColor || '#f6f3eb';
                this.assign(sketch, patch);

                this.loadSketch(sketch)

                this.resources.parsedFonts.get(this.state.sketch.defaultFontDesc.url);

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

        actions.sketch.setEditingItem.subscribe(m => {
            this.setEditingItem(m.data);
        });

        actions.sketch.setSelection.subscribe(m => {
            this.setSelection(m.data);
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
                if (!block.fontSize) {
                    block.fontSize = 128;
                }
                if (!block.textColor) {
                    block.textColor = "gray"
                }
                if (block.fontDesc) {
                    this.state.sketch.defaultFontDesc = block.fontDesc;
                } else {
                    block.fontDesc = this.state.sketch.defaultFontDesc;
                }

                this.state.sketch.textBlocks.push(block);
                events.textblock.added.dispatch(block);
                this.changedSketch();
            });

        actions.textBlock.updateAttr
            .subscribe(ev => {
                let block = this.getBlock(ev.data._id);
                if (block) {
                    let patch = <TextBlock>{
                        text: ev.data.text,
                        backgroundColor: ev.data.backgroundColor,
                        textColor: ev.data.textColor,
                        fontDesc: ev.data.fontDesc,
                        fontSize: ev.data.fontSize
                    };
                    this.assign(block, patch);
                    if (block.fontDesc) {
                        this.state.sketch.defaultFontDesc = block.fontDesc;
                    }
                    events.textblock.attrChanged.dispatch(block);
                    this.changedSketch();
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

    loadSketch(sketch: Sketch) {
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

    loadResources() {
        const loader = new FontFamiliesLoader();
        loader.loadListLocal(families => {
            families.length = Store.FONT_LIST_LIMIT;
            const dict = this.resources.fontFamilies;
            for (const familyGroup of families) {
                dict[familyGroup.family] = familyGroup;
            }

            // load fonts into browser for preview
            loader.loadForPreview(families.map(f => f.family));

            this.resources.parsedFonts.get(Store.ROBOTO_500_LOCAL);

            this.events.app.resourcesReady.dispatch(true);
        });
    }

    changedSketch() {
        this.events.sketch.contentChanged.dispatch(this.state.sketch);
        this._sketchContent$.onNext(this.state.sketch);
    }

    assign<T>(dest: T, source: T) {
        _.merge(dest, source);
    }

    createSketch(): Sketch {
        return {
            _id: newid(),
            defaultFontDesc: {
                family: "Roboto",
                variant: null,
                category: null,
                url: Store.ROBOTO_500_LOCAL
            },
            textBlocks: <TextBlock[]>[]
        };
    }

    private get sketchIdUrlParam(): string {
        const routeState = <RouteState>this.router.getState();
        return routeState.params.sketchId;
    }

    private set sketchIdUrlParam(value: string) {
        this.router.navigate("sketch", {sketchId: value});
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