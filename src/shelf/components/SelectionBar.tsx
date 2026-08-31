/**
 * The multi-select action bar.
 *
 * It appears in the panel footer only while something is selected, and it
 * states the count before it offers a verb. "Delete" next to a count the user
 * cannot see is how people delete forty things by accident.
 *
 * Destructive actions sit at the inner edge, furthest from where the pointer
 * enters the panel.
 */
import { t } from '../../i18n'
import { Button } from '../../ui'
import '../styles/selection-bar.css'

export interface SelectionBarProps {
  count: number
  /** Total in the current filtered view, for "select all". */
  total: number
  onSelectAll: () => void
  onClear: () => void
  onCopy: () => void
  onDelete: () => void
}

export function SelectionBar({
  count,
  total,
  onSelectAll,
  onClear,
  onCopy,
  onDelete
}: SelectionBarProps) {
  const allSelected = count > 0 && count === total

  return (
    <div className="bz-selection bz-row" role="toolbar" aria-label={t('shelf.select.count', { n: count })}>
      <span className="bz-selection-count bz-num">{t('shelf.select.count', { n: count })}</span>

      <span className="bz-row-fill" />

      <Button
        size="sm"
        onClick={allSelected ? onClear : onSelectAll}
        label={allSelected ? t('shelf.select.none') : t('shelf.select.all')}
      >
        {allSelected ? t('shelf.select.none') : t('shelf.select.all')}
      </Button>
      <Button size="sm" icon="copy" label={t('common.copy')} onClick={onCopy} />
      <Button
        size="sm"
        icon="trash"
        variant="danger"
        label={t('common.delete')}
        onClick={onDelete}
        disabled={count === 0}
      />
      <Button size="sm" icon="close" label={t('shelf.select.exit')} onClick={onClear} />
    </div>
  )
}
