/**
 * Kyriq premium-glass primitives. Single import surface for parcels B-I.
 *
 *   import { Button, GlassCard, Th, Td } from '@/components/ui';
 *
 * An agent that needs a primitive CHANGED reports back rather than editing it.
 * That rule is what stops five different glass cards appearing.
 */

export { AmbientBackground } from './ambient-background';

export {
  GlassCard,
  GlassPanel,
  GlassCardHeader,
  GlassCardTitle,
  GlassCardEyebrow,
  GlassCardBody,
  glassCardVariants,
  glassPanelVariants,
} from './glass-card';
export type { GlassCardProps, GlassPanelProps } from './glass-card';

export { Button, IconButton, buttonVariants } from './button';
export type { ButtonProps, IconButtonProps } from './button';

export { Input, Textarea, Select, Field, inputVariants } from './input';
export type { InputProps, TextareaProps, SelectProps, FieldProps } from './input';

export { Dialog, Sheet, dialogPanelVariants, sheetPanelVariants } from './dialog';
export type { DialogProps, SheetProps } from './dialog';

export { Tabs, TabPanel, tabsListVariants, tabTriggerVariants } from './tabs';
export type { TabsProps, TabItem } from './tabs';

export { Badge, StatusPill, badgeVariants, STATUS_TONES } from './badge';
export type { BadgeProps, StatusPillProps, StatusKey } from './badge';

export { Toast, toastVariants } from './toast';
export type { ToastProps } from './toast';

export { Skeleton, SkeletonText, SkeletonRows, skeletonVariants } from './skeleton';
export type { SkeletonProps } from './skeleton';

export { KpiTile, kpiTileVariants } from './kpi-tile';
export type { KpiTileProps } from './kpi-tile';

export {
  TableShell,
  TableScroll,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableEmpty,
  tableShellVariants,
  trVariants,
  thVariants,
  tdVariants,
} from './table';
export type { TableShellProps, TrProps, ThProps, TdProps } from './table';
