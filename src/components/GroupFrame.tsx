import { useState } from 'react';
import { useStore } from '../store';
import { clientToBoard } from '../lib/boardCoords';
import { bricksInGroup } from '../lib/groups';
import { matchesTags } from '../lib/tags';
import { MIX_COLORS, type Group } from '../types';

export function GroupFrame({ group }: { group: Group }) {
  const bricks = useStore((s) => s.bricks);
  const activeTags = useStore((s) => s.activeTags);
  const updateGroup = useStore((s) => s.updateGroup);
  const deleteGroup = useStore((s) => s.deleteGroup);
  const moveGroup = useStore((s) => s.moveGroup);
  const resizeGroup = useStore((s) => s.resizeGroup);
  const [menu, setMenu] = useState(false);

  const count = bricksInGroup(group, bricks).length;
  const filtering = activeTags.length > 0;
  const matches = matchesTags(
    [{ id: `group:${group.id}`, label: group.name, color: group.color, kind: 'group' }],
    activeTags
  );

  function onTitleDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p0 = clientToBoard(e.clientX, e.clientY);
    const offX = p0.x - group.board.x;
    const offY = p0.y - group.board.y;
    (e.target as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const p = clientToBoard(ev.clientX, ev.clientY);
      moveGroup(group.id, Math.max(0, p.x - offX), Math.max(0, p.y - offY));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function onResizeDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const p = clientToBoard(ev.clientX, ev.clientY);
      resizeGroup(group.id, p.x - group.board.x, p.y - group.board.y);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <div
      className={
        'group-frame' + (filtering ? (matches ? ' tag-match' : ' tag-dim') : '')
      }
      style={{
        left: group.board.x,
        top: group.board.y,
        width: group.board.w,
        height: group.board.h,
        borderColor: group.color,
        zIndex: menu ? 29 : undefined,
      }}
    >
      <div
        className="group-title"
        style={{ background: group.color }}
        onPointerDown={onTitleDown}
        title="Drag to move the group and everything in it"
      >
        <input
          className="group-name"
          value={group.name}
          onChange={(e) => updateGroup(group.id, { name: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
        />
        <span className="group-count">{count}</span>
        <button
          className="icon-btn"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setMenu((v) => !v)}
          title="Group options"
        >
          ⋯
        </button>
      </div>

      {menu && (
        <div className="group-menu" onMouseLeave={() => setMenu(false)}>
          <div className="swatch-row">
            {MIX_COLORS.map((c) => (
              <button
                key={c}
                className={'swatch' + (group.color === c ? ' on' : '')}
                style={{ background: c }}
                onClick={() => updateGroup(group.id, { color: c })}
              />
            ))}
          </div>
          <div className="menu-section">Notes &amp; #tags</div>
          <textarea
            rows={3}
            className="group-notes"
            placeholder="What this group is for… #tags"
            value={group.notes}
            onChange={(e) => updateGroup(group.id, { notes: e.target.value })}
          />
          <div className="menu-divider" />
          <button className="danger" onClick={() => deleteGroup(group.id)}>
            Delete group (keeps the cards)
          </button>
        </div>
      )}

      <div
        className="group-resize"
        onPointerDown={onResizeDown}
        title="Resize"
      />
    </div>
  );
}
