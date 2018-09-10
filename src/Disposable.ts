export class Disposable {
  private _disposed = false;

  public dispose(): void {
    if (this._disposed) return;

    this._disposed = true;

    this.disposeInternal();
  }

  protected disposeInternal(): void { }
}