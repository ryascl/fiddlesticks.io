import paper from 'paper'
import { PaperEventType } from './PaperEventType'
import { ExtendedEventType } from './mouseEventExt'
import { ObservableEvent } from '../events'

export class ViewZoom {

  project: paper.Project
  factor = 1.1

  private _minZoom: number
  private _maxZoom: number
  private _mouseNativeStart: paper.Point
  private _viewCenterStart: paper.Point

  constructor(project: paper.Project,
              getBackgroundItems?: () => paper.Item[]) {
    this.project = project

    this.project.view.element.onwheel = event => {
      const mousePosition = new paper.Point(event.offsetX, event.offsetY)
      this.changeZoomCentered(event.deltaY, mousePosition)
    }

    let didDrag = false

    this.project.view.on(PaperEventType.mouseDrag, ev => {
      const view = this.project.view
      const hit = project.hitTest(ev.point)
      if (!this._viewCenterStart) {  // not already dragging
        if (hit) {
          const backgroundItems = (getBackgroundItems && getBackgroundItems()) || []
          // if hit is on nothing or on a non-background item
          if (!hit.item || !backgroundItems.some(bi =>
            bi && (bi === hit.item || bi.isAncestor(hit.item)))) {
            // then don't use dragging
            return
          }
        }
        this._viewCenterStart = view.center
        // Have to use native mouse offset, because ev.delta
        //  changes as the view is scrolled.
        this._mouseNativeStart = new paper.Point(ev.event.offsetX, ev.event.offsetY)
        view.emit(ExtendedEventType.mouseDragStart, ev)
      } else {
        const nativeDelta = new paper.Point(
          ev.event.offsetX - this._mouseNativeStart.x,
          ev.event.offsetY - this._mouseNativeStart.y,
        )
        // Move into view coordinates to subract delta,
        //  then back into project coords.
        view.center = view.viewToProject(
          view.projectToView(this._viewCenterStart)
            .subtract(nativeDelta))
        didDrag = true
      }
    })

    this.project.view.on(PaperEventType.mouseUp, ev => {
      const view = this.project.view
      if (this._mouseNativeStart) {
        this._mouseNativeStart = null
        this._viewCenterStart = null
        view.emit(ExtendedEventType.mouseDragEnd, ev)
        if (didDrag) {
          this._viewChanged.notify(view.bounds)
          didDrag = false
        }
      }
    })
  }

  private _viewChanged = new ObservableEvent<paper.Rectangle>()

  get viewChanged(): ObservableEvent<paper.Rectangle> {
    return this._viewChanged
  }

  get zoom(): number {
    return this.project.view.zoom
  }

  get zoomRange(): number[] {
    return [this._minZoom, this._maxZoom]
  }

  setZoomRange(range: paper.Size[]): number[] {
    const view = this.project.view
    const aSize = range.shift()
    const bSize = range.shift()
    const a = aSize && Math.min(
      view.bounds.height / aSize.height,
      view.bounds.width / aSize.width)
    const b = bSize && Math.min(
      view.bounds.height / bSize.height,
      view.bounds.width / bSize.width)
    const min = Math.min(a, b)
    if (min) {
      this._minZoom = min
    }
    const max = Math.max(a, b)
    if (max) {
      this._maxZoom = max
    }
    return [this._minZoom, this._maxZoom]
  }

  zoomTo(rect: paper.Rectangle) {
    if (rect.isEmpty() || rect.width === 0 || rect.height === 0) {
      console.warn('skipping zoom to', rect)
      return
    }
    const view = this.project.view
    view.center = rect.center
    view.zoom = Math.min(
      view.viewSize.height / rect.height,
      view.viewSize.width / rect.width)
    this._viewChanged.notify(view.bounds)
  }

  changeZoomCentered(delta: number, mousePos: paper.Point) {
    if (!delta) {
      return
    }
    const view = this.project.view
    const oldZoom = view.zoom
    const oldCenter = view.center
    const viewPos = view.viewToProject(mousePos)

    let newZoom = delta < 0
      ? view.zoom * this.factor
      : view.zoom / this.factor
    newZoom = this.setZoomConstrained(newZoom)

    if (!newZoom) {
      return
    }

    const zoomScale = oldZoom / newZoom
    const centerAdjust = viewPos.subtract(oldCenter)
    const offset = viewPos.subtract(centerAdjust.multiply(zoomScale))
      .subtract(oldCenter)

    view.center = view.center.add(offset)

    this._viewChanged.notify(view.bounds)
  };

  /**
   * Set zoom level.
   * @returns zoom level that was set, or null if it was not changed
   */
  private setZoomConstrained(zoom: number): number {
    if (this._minZoom) {
      zoom = Math.max(zoom, this._minZoom)
    }
    if (this._maxZoom) {
      zoom = Math.min(zoom, this._maxZoom)
    }
    const view = this.project.view
    if (zoom != view.zoom) {
      view.zoom = zoom
      return zoom
    }
    return null
  }
}
