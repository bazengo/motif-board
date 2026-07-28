import { useStore } from '../store';
import { allTags, tagsForBrick, tagsForMix } from '../lib/tags';

export function TagBar() {
  const bricks = useStore((s) => s.bricks);
  const mixes = useStore((s) => s.mixes);
  const activeTags = useStore((s) => s.activeTags);
  const toggleTag = useStore((s) => s.toggleTag);
  const clearTags = useStore((s) => s.clearTags);
  const setSelection = useStore((s) => s.setSelection);

  const tags = allTags(bricks, mixes);
  if (tags.length === 0 && bricks.length === 0) return null;

  return (
    <div className="tag-bar">
      {tags.map((t) => {
        const on = activeTags.includes(t.id);
        return (
          <button
            key={t.id}
            className={'tag-pill' + (on ? ' on' : '')}
            style={
              on
                ? { background: t.color, borderColor: t.color, color: '#16181d' }
                : { borderColor: t.color, color: t.color }
            }
            onClick={(e) => {
              // shift-click selects everything carrying the tag instead of
              // filtering by it — the quickest route to a batch action
              if (e.shiftKey) {
                setSelection({
                  bricks: bricks
                    .filter((b) =>
                      tagsForBrick(b, mixes, bricks).some(
                        (x) => x.id === t.id
                      )
                    )
                    .map((b) => b.id),
                  mixes: mixes
                    .filter((m) => tagsForMix(m).some((x) => x.id === t.id))
                    .map((m) => m.id),
                });
                return;
              }
              toggleTag(t.id);
            }}
            title={
              (t.kind === 'mix'
                ? `Mix: ${t.label}`
                : t.kind === 'root'
                  ? `Lineage from: ${t.label}`
                  : `Tag ${t.label}`) +
              ' — click to filter, shift-click to select its members'
            }
          >
            {t.kind === 'mix' && <span className="tag-pill-icon">🎚</span>}
            {t.kind === 'root' && <span className="tag-pill-icon">🌱</span>}
            {t.label}
          </button>
        );
      })}
      <span className="brush-spacer" />

      {activeTags.length > 0 && (
        <button className="tag-clear" onClick={clearTags}>
          clear
        </button>
      )}
    </div>
  );
}
