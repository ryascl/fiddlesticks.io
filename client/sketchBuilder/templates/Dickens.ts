namespace SketchBuilder.Templates {
    
    export class Dickens implements SketchBuilder.Template {
        
        name = "Dickens";
        description: "Stack blocks of text in the form of a crazy ladder.";
        image: string;
        
        createControls(design: Design): SketchBuilder.VControl[] {
            return [];
        }
        
        build(design: Design): paper.Item {
            return new paper.PointText({
                content: "Dickens!",
                fillColor: "green"
            });
        }
    }
    
}