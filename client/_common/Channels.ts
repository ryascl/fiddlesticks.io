
class Actions extends TypedChannel.Channel {
    
    app = {       
        /**
         * Instructs Store to load retained state from local storage, if it exists.
         */
        initWorkspace: this.topic<void>("app.initWorkspace"),
        
        loadFont: this.topic<string>("app.loadFont")
    };
    
    designer = {
        zoomToFit: this.topic<void>("designer.zoomToFit"),
        exportingImage: this.topic<void>("designer.exportImage"),
        exportPNG: this.topic<void>("designer.exportPNG"),
        exportSVG: this.topic<void>("designer.exportSVG"),
        viewChanged: this.topic<paper.Rectangle>("designer.viewChanged")
    }
    
    sketch = {
        create: this.topic<SketchAttr>("sketch.create"),
        attrUpdate: this.topic<SketchAttr>("sketch.attrUpdate"),
        setEditingItem: this.topic<PositionedObjectRef>("sketch.setEditingItem"),
        setSelection: this.topic<WorkspaceObjectRef>("sketch.setSelection"),
    };
    
    textBlock = {
        add: this.topic<TextBlock>("textblock.add"),
        updateAttr: this.topic<TextBlock>("textblock.updateAttr"),
        updateArrange: this.topic<TextBlock>("textblock.updateArrange"),
        remove: this.topic<TextBlock>("textblock.remove")
    };
    
}

class Events extends TypedChannel.Channel {
    
    app = {
        resourcesReady: this.topic<boolean>("app.resourcesReady"),
        workspaceInitialized: this.topic<Sketch>("app.workspaceInitialized"),
        fontLoaded: this.topic<opentype.Font>("app.fontLoaded")
    }
    
    designer = {
        zoomToFitRequested: this.topic<void>("designer.zoomToFitRequested"),
        exportPNGRequested: this.topic<void>("designer.exportPNGRequested"),
        exportSVGRequested: this.topic<void>("designer.exportSVGRequested"),
        viewChanged: this.topic<paper.Rectangle>("designer.viewChanged")
    };
    
    sketch = {
        loaded: this.topic<Sketch>("sketch.loaded"),
        attrChanged: this.topic<Sketch>("sketch.attrChanged"),
        contentChanged: this.topic<Sketch>("sketch.contentChanged"),
        editingItemChanged: this.topic<PositionedObjectRef>("sketch.editingItemChanged"),
        selectionChanged: this.topic<WorkspaceObjectRef>("sketch.selectionChanged"),
        saveLocalRequested: this.topic<void>("sketch.savelocal.saveLocalRequested")
    };
    
    textblock = {
        added: this.topic<TextBlock>("textblock.added"),
        attrChanged: this.topic<TextBlock>("textblock.attrChanged"),
        arrangeChanged: this.topic<TextBlock>("textblock.arrangeChanged"),
        removed: this.topic<TextBlock>("textblock.removed"),
        loaded: this.topic<TextBlock>("textblock.loaded"),
        editorClosed: this.topic<TextBlock>("textblock.editorClosed"),
    };
    
}

class Channels {
    actions: Actions = new Actions();
    events: Events = new Events();
}