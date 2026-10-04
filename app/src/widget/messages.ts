import { z } from 'zod';
import type { WidgetTarget } from '@/platform/types';

// Cross-window event names. The main window and the widget are separate webviews.
export const WIDGET_OPEN_EVENT = 'widget:open';
export const WIDGET_MAIN_VISIBILITY_EVENT = 'widget:main-visibility';
export const WIDGET_REQUEST_VISIBILITY_EVENT = 'widget:request-visibility';
export const WIDGET_SETTINGS_EVENT = 'widget:settings';

export const OpenPayloadSchema = z.object({ path: z.string().regex(/^\/(?!\/)/) });
export const VisibilityPayloadSchema = z.object({ visible: z.boolean() });

/** Where in the Command Center a widget click should land. */
export function targetPath(target?: WidgetTarget): string {
  if (target?.approvalId) return '/approvals';
  if (target?.layerId) return `/layers/${encodeURIComponent(target.layerId)}`;
  return '/';
}
