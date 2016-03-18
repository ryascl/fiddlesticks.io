namespace SketchEditor {

    export class PathSection implements paper.Curvelike {
        path: paper.Path;
        offset: number;
        length: number;

        constructor(path: paper.Path, offset: number, length: number) {
            this.path = path;
            this.offset = offset;
            this.length = length;
        }

        getPointAt(offset: number) {
            return this.path.getPointAt(offset + this.offset);
        }
    }

}