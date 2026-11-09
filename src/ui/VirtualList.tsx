import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export function VirtualList<T>({
  items,
  estimateSize,
  getKey,
  renderItem,
}: {
  items: T[];
  estimateSize: number;
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(480);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => setHeight(el.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { start, end, offset } = useMemo(() => {
    const overscan = 8;
    const startIndex = Math.max(0, Math.floor(scrollTop / estimateSize) - overscan);
    const visible = Math.ceil(height / estimateSize) + overscan * 2;
    const endIndex = Math.min(items.length, startIndex + visible);
    return { start: startIndex, end: endIndex, offset: startIndex * estimateSize };
  }, [scrollTop, height, estimateSize, items.length]);

  return (
    <div
      className="list-viewport"
      ref={parentRef}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * estimateSize, position: 'relative' }}>
        <div style={{ transform: `translateY(${offset}px)` }}>
          {items.slice(start, end).map((item, index) => (
            <div key={getKey(item, start + index)} style={{ minHeight: estimateSize }}>
              {renderItem(item, start + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
