"use client";

import { useCallback, useMemo } from "react";
import {
  Responsive,
  useContainerWidth,
  type Layout,
} from "react-grid-layout";
import { verticalCompactor } from "react-grid-layout/react";
import { Pencil, RotateCcw, Check } from "lucide-react";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { WIDGET_REGISTRY, type LayoutItem } from "./widget-registry";
import WidgetWrapper from "./WidgetWrapper";
import WidgetCatalog from "./WidgetCatalog";
import { WIDGET_COMPONENTS } from "./widgets";
import { useDeskLayout } from "@/hooks/useDeskLayout";

export default function DeskPage() {
  const { width, containerRef, mounted } = useContainerWidth();

  const {
    layout,
    editMode,
    setEditMode,
    updateLayout,
    addWidget,
    removeWidget,
    resetLayout,
  } = useDeskLayout();

  const activeIds = useMemo(() => layout.map((l) => l.i), [layout]);

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      // Only persist layout changes when user is actively editing
      if (!editMode) return;

      const merged: LayoutItem[] = newLayout.map((gl) => {
        const existing = layout.find((l) => l.i === gl.i);
        return {
          i: gl.i,
          x: gl.x,
          y: gl.y,
          w: gl.w,
          h: gl.h,
          minW: existing?.minW,
          minH: existing?.minH,
        };
      });
      updateLayout(merged);
    },
    [editMode, layout, updateLayout],
  );

  return (
    <div
      ref={containerRef}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl sm:text-3xl lg:text-4xl font-black text-[var(--text-primary)] leading-tight"
          style={{
            textShadow: "2px 2px 0 #FFE600",
          }}
        >
          The Desk
        </h1>

        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <button
                onClick={resetLayout}
                className="flex items-center gap-1.5 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] shadow-[3px_3px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all font-heading"
              >
                <RotateCcw size={14} aria-hidden="true" />
                Reset
              </button>
              <button
                onClick={() => setEditMode(false)}
                className="flex items-center gap-1.5 rounded-xl border-2 border-[var(--border-strong)] bg-[#FFE600] px-3 py-2 text-xs font-bold text-[#0A0A0A] shadow-[3px_3px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all font-heading"
              >
                <Check size={14} aria-hidden="true" />
                Done
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-1.5 rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] shadow-[3px_3px_0_var(--border-strong)] hover:shadow-[1px_1px_0_var(--border-strong)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all font-heading"
            >
              <Pencil size={14} aria-hidden="true" />
              Make it yours
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {mounted && (
        <Responsive
          width={width}
          layouts={{ lg: layout, md: layout }}
          breakpoints={{ lg: 1024, md: 768, sm: 480, xs: 0 }}
          cols={{ lg: 12, md: 6, sm: 6, xs: 4 }}
          rowHeight={80}
          margin={[16, 16] as const}
          dragConfig={{
            enabled: editMode,
            handle: ".widget-drag-handle",
          }}
          resizeConfig={{ enabled: editMode }}
          compactor={verticalCompactor}
          onLayoutChange={handleLayoutChange}
        >
          {layout.map((item) => {
            const meta = WIDGET_REGISTRY[item.i];
            const WidgetComponent = WIDGET_COMPONENTS[item.i];
            if (!meta || !WidgetComponent) return null;

            return (
              <div
                key={item.i}
                className={editMode ? "widget-drag-handle cursor-grab" : ""}
              >
                <WidgetWrapper
                  meta={meta}
                  editMode={editMode}
                  onRemove={() => removeWidget(item.i)}
                >
                  <WidgetComponent />
                </WidgetWrapper>
              </div>
            );
          })}
        </Responsive>
      )}

      {/* Widget Catalog — visible only in edit mode */}
      {editMode && (
        <div className="mt-6">
          <WidgetCatalog activeIds={activeIds} onAdd={addWidget} />
        </div>
      )}
    </div>
  );
}
