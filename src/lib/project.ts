import { useStore } from '../store';
import type { Brick, Mix, PhraseTemplate } from '../types';

interface ProjectFile {
  app: 'motif-board';
  version: 3;
  bricks: Brick[];
  mixes: Mix[];
  globalBpm: number;
  templates: PhraseTemplate[];
}

export function exportProject(filename = 'motif-board-project.json') {
  const s = useStore.getState();
  const data: ProjectFile = {
    app: 'motif-board',
    version: 3,
    bricks: s.bricks,
    mixes: s.mixes,
    globalBpm: s.globalBpm,
    templates: s.templates,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importProject(file: File): Promise<void> {
  const text = await file.text();
  const data = JSON.parse(text) as Partial<ProjectFile>;
  if (data.app !== 'motif-board' || !Array.isArray(data.bricks)) {
    throw new Error('Not a Motif Board project file.');
  }
  useStore.setState({
    bricks: data.bricks,
    mixes: data.mixes ?? [],
    globalBpm: data.globalBpm ?? 120,
    templates: data.templates ?? [],
    activeBrush: null,
    activeMixId: data.mixes?.[0]?.id ?? null,
    selectedBrickId: null,
    editorOpen: false,
  });
}
