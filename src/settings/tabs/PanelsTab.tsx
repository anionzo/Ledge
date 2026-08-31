/**
 * Panels.
 *
 * Ledge is now one hub, not two panels: a single frame docked to a screen edge
 * that carries the quota strip above the clipboard. So this tab configures one
 * frame — its edge, its size, how near the pointer must come — and then which
 * of its two halves are switched on. The old side-by-side "Shelf here, Gauge
 * there" model is gone; the diagram shows the single frame it really is.
 *
 * Frame geometry lives under `shelf.*` (which is what the hub reads for its
 * side and height). The two section toggles map to `shelf.enabled` (clipboard)
 * and `gauge.enabled` (quota). Picking the edge writes both `shelf.side` and
 * `gauge.side` so nothing downstream can read a stale gauge edge.
 */
import type { PanelSide, TriggerAlign } from '../../../shared/types/settings'
import type { SettingsTabProps } from '../context'
import { Field, Section, Segmented, Slider, Switch, useFieldId } from '../components/Controls'
import { Icon } from '../../ui'
import { t } from '../../i18n'
import '../styles/panels-tab.css'

export function PanelsTab({ settings, capabilities, update }: SettingsTabProps) {
  const clipboardEnabledId = useFieldId('clipboard-on')
  const quotaEnabledId = useFieldId('quota-on')
  const proximityId = useFieldId('proximity')
  const heightId = useFieldId('height')
  const maxItemsId = useFieldId('max-items')
  const thresholdId = useFieldId('threshold')
  const intervalId = useFieldId('interval')

  const sideOptions: { value: PanelSide; label: string }[] = [
    { value: 'left', label: t('settings.panels.side.left') },
    { value: 'right', label: t('settings.panels.side.right') }
  ]

  const alignOptions: { value: TriggerAlign; label: string }[] = [
    { value: 'top', label: t('settings.panels.trigger.top') },
    { value: 'center', label: t('settings.panels.trigger.center') },
    { value: 'bottom', label: t('settings.panels.trigger.bottom') }
  ]

  // One frame, one edge. The hub reads `shelf.side`; `gauge.side` is kept in
  // lockstep so a legacy reader of it can never disagree about which edge the
  // single frame is on.
  const setSide = (side: PanelSide) => void update({ shelf: { side }, gauge: { side } })

  return (
    <>
      <Section title={t('settings.tab.panels')} description={t('settings.panels.intro')}>
        <EdgeDiagram
          side={settings.shelf.side}
          clipboardOn={settings.shelf.enabled}
          quotaOn={settings.gauge.enabled}
        />

        <Field
          label={t('settings.panels.side')}
          control={
            <Segmented
              value={settings.shelf.side}
              options={sideOptions}
              label={t('settings.panels.side')}
              onChange={setSide}
            />
          }
        />

        {/*
          Not a control — there is nothing to choose. How the frame gets out of
          the way is decided by the platform, and saying which one is in force
          is the difference between "it shrinks to a sliver on my machine" being
          a documented behaviour and being a bug report.
        */}
        <div className="bz-collapse-note">
          <Icon name="info" size={12} />
          <p>
            {capabilities.clickThrough
              ? t('settings.panels.collapse.clickthrough')
              : t('settings.panels.collapse.resize', { n: 4 })}
          </p>
        </div>
      </Section>

      <Section title={t('settings.panels.sections')} description={t('settings.panels.sections.help')}>
        <Field
          label={t('settings.panels.clipboard')}
          htmlFor={clipboardEnabledId}
          control={
            <Switch
              id={clipboardEnabledId}
              checked={settings.shelf.enabled}
              label={t('settings.panels.clipboard.enabled')}
              onChange={(enabled) => void update({ shelf: { enabled } })}
            />
          }
        />
        <Field
          label={t('settings.panels.quota')}
          htmlFor={quotaEnabledId}
          control={
            <Switch
              id={quotaEnabledId}
              checked={settings.gauge.enabled}
              label={t('settings.panels.quota.enabled')}
              onChange={(enabled) => void update({ gauge: { enabled } })}
            />
          }
        />
      </Section>

      <Section title={t('settings.panels.frame')}>
        <Field
          label={t('settings.panels.proximity')}
          help={t('settings.panels.proximity.help')}
          htmlFor={proximityId}
          control={
            <Slider
              id={proximityId}
              value={settings.shelf.edgeProximityPx}
              min={1}
              max={20}
              label={t('settings.panels.proximity')}
              format={(n) => t('settings.panels.pixels', { n })}
              onCommit={(edgeProximityPx) => void update({ shelf: { edgeProximityPx } })}
            />
          }
        />
        <Field
          label={t('settings.panels.height')}
          htmlFor={heightId}
          control={
            <Slider
              id={heightId}
              value={Math.round(settings.shelf.heightRatio * 100)}
              min={50}
              max={80}
              step={5}
              label={t('settings.panels.height')}
              format={(n) => t('settings.panels.percent', { n })}
              onCommit={(percent) => void update({ shelf: { heightRatio: percent / 100 } })}
            />
          }
        />
        <Field
          label={t('settings.panels.trigger_align')}
          control={
            <Segmented
              value={settings.shelf.triggerAlign}
              options={alignOptions}
              label={t('settings.panels.trigger_align')}
              onChange={(triggerAlign) => void update({ shelf: { triggerAlign } })}
            />
          }
        />
      </Section>

      <Section title={t('settings.panels.clipboard')}>
        <Field
          label={t('settings.panels.max_items')}
          help={t('settings.panels.max_items.help')}
          htmlFor={maxItemsId}
          control={
            <Slider
              id={maxItemsId}
              value={settings.shelf.maxItems}
              min={50}
              max={1000}
              step={50}
              label={t('settings.panels.max_items')}
              format={(n) => t('settings.panels.items', { n })}
              onCommit={(maxItems) => void update({ shelf: { maxItems } })}
            />
          }
        />
      </Section>

      <Section title={t('settings.panels.quota')}>
        <Field
          label={t('settings.panels.alert_threshold')}
          help={t('settings.panels.alert_threshold.help')}
          htmlFor={thresholdId}
          control={
            <Slider
              id={thresholdId}
              value={settings.gauge.alertThreshold}
              min={50}
              max={99}
              label={t('settings.panels.alert_threshold')}
              format={(n) => t('settings.panels.percent', { n })}
              onCommit={(alertThreshold) => void update({ gauge: { alertThreshold } })}
            />
          }
        />
        <Field
          label={t('settings.panels.refresh_interval')}
          htmlFor={intervalId}
          control={
            <Slider
              id={intervalId}
              value={Math.round(settings.gauge.refreshIntervalMs / 1000)}
              min={15}
              max={300}
              step={15}
              label={t('settings.panels.refresh_interval')}
              format={(n) => t('settings.panels.seconds', { n })}
              onCommit={(seconds) => void update({ gauge: { refreshIntervalMs: seconds * 1000 } })}
            />
          }
        />
      </Section>
    </>
  )
}

/**
 * A plan view of the display with the single hub drawn on its edge.
 *
 * The frame is split into its two stacked halves — the quota strip on top, the
 * clipboard below — and each dims when its section is switched off, so the
 * diagram mirrors exactly what the toggles above it do.
 */
function EdgeDiagram({
  side,
  clipboardOn,
  quotaOn
}: {
  side: PanelSide
  clipboardOn: boolean
  quotaOn: boolean
}) {
  return (
    <div className="bz-edge-diagram" role="img" aria-label={t('settings.panels.intro')}>
      <div className="bz-edge-screen">
        <span className="bz-edge-panel" data-side={side}>
          <span className="bz-edge-section" data-part="quota" data-off={quotaOn ? undefined : true}>
            {t('settings.panels.quota')}
          </span>
          <span
            className="bz-edge-section"
            data-part="clipboard"
            data-off={clipboardOn ? undefined : true}
          >
            {t('settings.panels.clipboard')}
          </span>
        </span>
      </div>
    </div>
  )
}
