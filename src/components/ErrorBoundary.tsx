import { Component, type ReactNode } from 'react';

const STORE_KEY = 'music-composition-suite';

/**
 * Last line of defence: a crash anywhere in the tree lands here instead of a
 * blank page. Everything in this screen reads localStorage directly and uses
 * plain DOM state — it must keep working when the store or React state is the
 * thing that's broken.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  private downloadRescue = () => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) {
        alert('No saved data found in this browser.');
        return;
      }
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'motif-board-rescue.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Could not read saved data: ' + String(e));
    }
  };

  private reset = () => {
    if (
      !confirm(
        'Clear the saved project and restart empty? Download the rescue file first if you have not.'
      )
    )
      return;
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* nothing else to do */
    }
    location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash-screen">
        <div className="crash-card">
          <h2>Something broke</h2>
          <p>
            Motif Board hit an error it couldn't recover from. Your project is
            still saved in this browser — download a copy of it now, then
            reload.
          </p>
          <pre className="crash-detail">{String(this.state.error)}</pre>
          <div className="crash-actions">
            <button className="primary-btn" onClick={this.downloadRescue}>
              ⇩ Download rescue file
            </button>
            <button className="ghost-btn" onClick={() => location.reload()}>
              ↻ Reload
            </button>
            <button className="ghost-btn danger-btn" onClick={this.reset}>
              Start over (clears save)
            </button>
          </div>
          <p className="crash-hint">
            A rescue file can be restored later via ⇧ Open — it's the same
            format as a saved project.
          </p>
        </div>
      </div>
    );
  }
}
