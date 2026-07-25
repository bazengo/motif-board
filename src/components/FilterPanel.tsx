import { EnvelopeEditor } from './EnvelopeEditor';
import { InfoTip } from './InfoTip';
import { FILTER_TYPES, type FilterSettings, type FilterEnvelope } from '../types';

/** Cutoff is dragged on a log scale — linear Hz spends most of the slider
 *  in a range that all sounds the same. */
const MIN_HZ = 60;
const MAX_HZ = 18000;
const toSlider = (hz: number) =>
  (Math.log(Math.max(MIN_HZ, Math.min(MAX_HZ, hz)) / MIN_HZ) /
    Math.log(MAX_HZ / MIN_HZ)) *
  100;
const fromSlider = (v: number) =>
  Math.round(MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, v / 100));

function formatHz(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${Math.round(hz)}`;
}

export function FilterPanel({
  filter,
  envelope,
  onFilter,
  onEnvelope,
}: {
  filter: FilterSettings;
  envelope: FilterEnvelope;
  onFilter: (f: FilterSettings) => void;
  onEnvelope: (fe: FilterEnvelope) => void;
}) {
  const sweeping = envelope.octaves > 0;

  return (
    <>
      <label className="side-label">
        Filter
        <InfoTip label="Filter help">
          The filter removes part of the sound above or below the{' '}
          <strong>cutoff</strong>, and <strong>resonance</strong> emphasises the
          frequencies right at it. <strong>Sweep</strong> then moves the cutoff
          on every note, using the envelope below — that movement is most of
          what makes a synth sound alive rather than static. At a sweep of 0 the
          filter stays put and the envelope does nothing.
        </InfoTip>
      </label>

      <div className="filter-row">
        <select
          className="sound-select"
          value={filter.type}
          onChange={(e) =>
            onFilter({ ...filter, type: e.target.value as FilterSettings['type'] })
          }
        >
          {FILTER_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <label className="knob-row">
        <span>Cutoff</span>
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={toSlider(envelope.baseFrequency)}
          onChange={(e) =>
            onEnvelope({
              ...envelope,
              baseFrequency: fromSlider(Number(e.target.value)),
            })
          }
        />
        <span className="knob-value">{formatHz(envelope.baseFrequency)}Hz</span>
      </label>

      <label className="knob-row">
        <span>Reso</span>
        <input
          type="range"
          min={0}
          max={16}
          step={0.1}
          value={filter.q}
          onChange={(e) => onFilter({ ...filter, q: Number(e.target.value) })}
        />
        <span className="knob-value">{filter.q.toFixed(1)}</span>
      </label>

      <label className="knob-row">
        <span>Sweep</span>
        <input
          type="range"
          min={0}
          max={7}
          step={0.1}
          value={envelope.octaves}
          onChange={(e) =>
            onEnvelope({ ...envelope, octaves: Number(e.target.value) })
          }
        />
        <span className="knob-value">
          {envelope.octaves === 0 ? 'off' : `${envelope.octaves.toFixed(1)} oct`}
        </span>
      </label>

      <label className="side-label">Filter envelope</label>
      {sweeping ? (
        <EnvelopeEditor
          value={envelope}
          onChange={(env) => onEnvelope({ ...envelope, ...env })}
        />
      ) : (
        <p className="side-hint">
          Raise <strong>Sweep</strong> above 0 to shape how the cutoff moves.
        </p>
      )}
    </>
  );
}
