
class StretchyPath extends paper.Group {
    sourcePath: paper.CompoundPath;
    displayPath: paper.CompoundPath;
    corners: paper.Segment[];
    outline: paper.Path;
    
    /**
     * For rebuilding the midpoint handles
     * as outline changes.
     */
    midpointGroup: paper.Group;
    segmentGroup: paper.Group;

    constructor(sourcePath: paper.CompoundPath) {
        super();

        this.sourcePath = sourcePath;
        this.sourcePath.visible = false;

        this.createOutline();
        this.createSegmentMarkers();
        this.updateMidpiontMarkers();

        this.mouseBehavior = {
            onClick: () => this.bringToFront(),
            onDragStart: () => this.bringToFront(),
            onDragMove: event => this.position = this.position.add(event.delta),
            onOverStart: () => this.setEditElementsVisibility(true),
            onOverEnd: () => this.setEditElementsVisibility(false)
        };

        this.arrangeContents();
        
        this.setEditElementsVisibility(false);
    }

    setEditElementsVisibility(value: boolean){
        this.segmentGroup.visible = value;
        this.midpointGroup.visible = value;
        this.outline.strokeColor = value ? 'lightgray' : null; 
    }

    arrangeContents() {
        this.updateMidpiontMarkers();
        this.arrangePath();
    }

    arrangePath() {
        let orthOrigin = this.sourcePath.bounds.topLeft;
        let orthWidth = this.sourcePath.bounds.width;
        let orthHeight = this.sourcePath.bounds.height;
        let sides = this.getOutlineSides();
        
        let top = sides[0];
        let bottom = sides[2];
        bottom.reverse();
        let projection = PaperHelpers.sandwichPathProjection(top, bottom);
        
        //let projection = PaperHelpers.boundsPathProjection(sides);
        
        let transform = new PathTransform(point => {
            let relative = point.subtract(orthOrigin);
            let unit = new paper.Point(
                relative.x / orthWidth,
                relative.y / orthHeight);
            let projected = projection(unit);
            return projected;
        });

        for(let side of sides){
            side.remove();
        }
        
        let newPath = <paper.CompoundPath>this.sourcePath.clone();
        newPath.visible = true;
        newPath.fillColor = '#7D5965';

        transform.transformPathItem(newPath);

        if (this.displayPath) {
            this.displayPath.remove();
        }

        this.displayPath = newPath;
        this.insertChild(1, newPath);
    }

    private getOutlineSides(): paper.Path[] {
        let sides: paper.Path[] = [];
        let segmentGroup: paper.Segment[] = [];
        
        let cornerPoints = this.corners.map(c => c.point);
        let first = cornerPoints.shift(); 
        cornerPoints.push(first);

        let targetCorner = cornerPoints.shift();
        let segmentList = this.outline.segments.map(x => x);
        let i = 0;
        segmentList.push(segmentList[0]);
        for(let segment of segmentList){
            
            segmentGroup.push(segment);
    
            if(targetCorner.isClose(segment.point, paper.Numerical.EPSILON)) {
                // finish path
                sides.push(new paper.Path(segmentGroup));
                segmentGroup = [segment];
                targetCorner = cornerPoints.shift();
            }
                
            i++;
        }
        
        if(sides.length !== 4){
            console.error('sides', sides);
            throw 'failed to get sides';
        }
        
        return sides;
    }
    
    private createOutline() {
        let bounds = this.sourcePath.bounds;
        let outline = new paper.Path(
            PaperHelpers.corners(this.sourcePath.bounds));
        outline.fillColor = new paper.Color(window.app.canvasColor);
        outline.closed = true;
        outline.dashArray = [5, 5];
        outline.opacity = 0;
        this.outline = outline;

        // track corners so we know how to arrange the text
        this.corners = outline.segments.map(s => s);

        this.addChild(outline);
    }

    private createSegmentMarkers() {
        let bounds = this.sourcePath.bounds;
        this.segmentGroup = new paper.Group();
        for (let segment of this.outline.segments) {
            let handle = new SegmentHandle(segment);
            handle.onChangeComplete = () => this.arrangeContents();
            this.segmentGroup.addChild(handle);
        }
        this.addChild(this.segmentGroup);
    }

    private updateMidpiontMarkers() {
        if(this.midpointGroup){
            this.midpointGroup.remove();
        }
        this.midpointGroup = new paper.Group();
        this.outline.curves.forEach(curve => {
            // skip left and right sides
            if(
                curve.segment1 === this.corners[1]
                || curve.segment1 === this.corners[3]
                // curve.segment1.point.isClose(this.corners[1].point, Numerical.EPSILON)
                // || curve.segment1.point.isClose(this.corners[3].point, Numerical.EPSILON)
                ){
                    return;   
                }
            let handle = new CurveSplitterHandle(curve);
            handle.onDragEnd = (newSegment, event) => {
                let newHandle = new SegmentHandle(newSegment);
                newHandle.onChangeComplete = () => this.arrangeContents();
                this.addChild(newHandle);
                handle.remove();
                this.arrangeContents();
            };
            this.midpointGroup.addChild(handle);
        });
        this.addChild(this.midpointGroup);
    }
}
