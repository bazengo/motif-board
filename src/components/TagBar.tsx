import { useStore } from '../store';
import { allTags } from '../lib/tags';

export function TagBar() {
  const bricks = useStore((s) => s.bricks);
  const mixes = useStore((s) => s.mixes);
  const activeTags = useStore((s) => s.activeTags);
  const toggleTag = useStore((s) => s.toggleTag);
  const clearTags = useStore((s) => s.clearTags);

  const tags = allTags(bricks, mixes);
  if (tags.length === 0) return null;

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
            title={t.kind === 'mix' ? `Mix: ${t.label}` : `Tag ${t.label}`}
          >
            {t.kind === 'mix' && <span className="tag-pill-icon">🎚</span>}
            {t.label}
          </button>
        );
      })}
      {activeTags.length > 0 && (
        <button className="tag-clear" onClick={clearTags}>
          clear
        </button>
      )}
    </div>
  );
}
