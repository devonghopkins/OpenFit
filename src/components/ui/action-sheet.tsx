import type { LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export interface ActionSheetItem {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  /** Right-aligned hint, e.g. the current value */
  detail?: string
  destructive?: boolean
  hidden?: boolean
  disabled?: boolean
}

/** A list of large, tappable actions in a bottom sheet (iOS action-sheet style). */
export function ActionSheet({
  open,
  onOpenChange,
  title,
  description,
  items,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  items: ActionSheetItem[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent bodyClassName="gap-3">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className={cn(!description && 'sr-only')}>
            {description ?? 'Choose an action'}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-2 flex flex-col">
          {items.filter(i => !i.hidden).map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                onOpenChange(false)
                item.onSelect()
              }}
              className={cn(
                'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] transition-colors hover:bg-muted active:bg-muted disabled:opacity-40',
                item.destructive && 'text-volume-danger',
              )}
            >
              {item.icon && <item.icon className="h-5 w-5 shrink-0 opacity-80" />}
              <span className="flex-1">{item.label}</span>
              {item.detail && <span className="text-sm text-muted-foreground">{item.detail}</span>}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
