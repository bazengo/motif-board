import { useStore } from '../store';
import { allTags } from '../lib/tags';
import { SORT_MODES } from '../lib/arrange';

export function TagBar() {
  const bricks = useStore((s) => s.bricks);
  const mixes = useStore((s) => s.mixes);
  const groups = useStore((s) => s.groups);
  const activeTags = useStore((s) => s.activeTags);
  const toggleTag = useStore((s) => s.toggleTag);
  const clearTags = useStore((s) => s.clearTags);
  const sortBoard = useStore((s) => s.sortBoard);

  const tags = allTags(bricks, mixes, groups);
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
            onClick={() => toggleTag(t.id)}
            title={
              t.kind === 'mix'
                ? `Mix: ${t.label}`
                : t.kind === 'root'
                  ? `Lineage from: ${t.label}`
                  : t.kind === 'group'
                    ? `Group: ${t.label}`
                    : `Tag ${t.label}`
            }
          >
            {t.kind === 'mix' && <span className="tag-pill-icon">🎚</span>}
            {t.kind === 'group' && <span className="tag-pill-icon">▣</span>}
            {t.kind === 'root' && <span className="tag-pill-icon">🌱</span>}
            {t.label}
          </button>
        );
      })}
      <span className="brush-spacer" />

      <span className="sort-group" title="Lay the board out in labelled columns">
        <span className="sort-label">Sort by</span>
        {SORT_MODES.map((m) => (
          <button
            key={m.id}
            className="sort-btn"
            onClick={() => sortBoard(m.id)}
            title={`Arrange cards into columns by ${m.label} (undo restores your layout)`}
          >
            {m.label}
          </button>
        ))}
      </span>

      {activeTags.length > 0 && (
        <button className="tag-clear" onClick={clearTags}>
          clear
        </button>
      )}
    </div>
  );
}
