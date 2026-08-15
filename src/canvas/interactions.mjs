import { APP_CONFIG } from '../config.mjs';

export function pxToMmX(px, pageEl, paperWidthMm = APP_CONFIG.PAPER_WIDTH_MM) {
    if (!pageEl?.clientWidth) return 0;
    return (px / pageEl.clientWidth) * paperWidthMm;
}

export function pxToMmY(px, pageEl, paperHeightMm = APP_CONFIG.PAPER_HEIGHT_MM) {
    if (!pageEl?.clientHeight) return 0;
    return (px / pageEl.clientHeight) * paperHeightMm;
}

export function findSnapPosition({
    left,
    top,
    width,
    height,
    siblings = [],
    tolerance = 5
}) {
    let snappedLeft = left;
    let snappedTop = top;
    let guideX = null;
    let guideY = null;
    let bestXDistance = tolerance;
    let bestYDistance = tolerance;

    siblings.forEach(sibling => {
        const siblingLeft = sibling.left;
        const siblingTop = sibling.top;
        const siblingWidth = sibling.width;
        const siblingHeight = sibling.height;

        const xCandidates = [
            [siblingLeft, siblingLeft],
            [siblingLeft + siblingWidth - width, siblingLeft + siblingWidth],
            [siblingLeft + (siblingWidth - width) / 2, siblingLeft + siblingWidth / 2]
        ];
        xCandidates.forEach(([candidate, guide]) => {
            const distance = Math.abs(left - candidate);
            if (distance < bestXDistance) {
                bestXDistance = distance;
                snappedLeft = candidate;
                guideX = guide;
            }
        });

        const yCandidates = [
            [siblingTop, siblingTop],
            [siblingTop + siblingHeight - height, siblingTop + siblingHeight],
            [siblingTop + (siblingHeight - height) / 2, siblingTop + siblingHeight / 2]
        ];
        yCandidates.forEach(([candidate, guide]) => {
            const distance = Math.abs(top - candidate);
            if (distance < bestYDistance) {
                bestYDistance = distance;
                snappedTop = candidate;
                guideY = guide;
            }
        });
    });

    return {
        left: guideX === null ? left : snappedLeft,
        top: guideY === null ? top : snappedTop,
        guideX,
        guideY
    };
}

const RESIZE_DIRECTIONS = new Set(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

export function createMarqueeRect(startX, startY, currentX, currentY) {
    return {
        left: Math.min(startX, currentX),
        top: Math.min(startY, currentY),
        right: Math.max(startX, currentX),
        bottom: Math.max(startY, currentY),
        width: Math.abs(currentX - startX),
        height: Math.abs(currentY - startY)
    };
}

export function isRectSelected(itemRect, marqueeRect, mode = 'contain') {
    if (mode === 'contain') {
        return itemRect.left >= marqueeRect.left &&
            itemRect.top >= marqueeRect.top &&
            itemRect.right <= marqueeRect.right &&
            itemRect.bottom <= marqueeRect.bottom;
    }
    if (mode !== 'intersect') throw new TypeError('Mode marquee tidak valid.');
    return itemRect.right >= marqueeRect.left &&
        itemRect.left <= marqueeRect.right &&
        itemRect.bottom >= marqueeRect.top &&
        itemRect.top <= marqueeRect.bottom;
}

export function calculateResizeGeometry({
    x,
    y,
    width,
    height,
    deltaX,
    deltaY,
    direction,
    rotation = 0,
    keepAspectRatio = false,
    fromCenter = false,
    minWidth = 10,
    minHeight = 10,
    pageWidth = Number.POSITIVE_INFINITY,
    pageHeight = Number.POSITIVE_INFINITY
}) {
    if (!RESIZE_DIRECTIONS.has(direction)) throw new TypeError('Arah resize tidak valid.');
    const startWidth = Math.max(minWidth, Number(width));
    const startHeight = Math.max(minHeight, Number(height));
    const horizontalDirection = direction.includes('e') ? 1 : direction.includes('w') ? -1 : 0;
    const verticalDirection = direction.includes('s') ? 1 : direction.includes('n') ? -1 : 0;

    let left = -startWidth / 2;
    let right = startWidth / 2;
    let top = -startHeight / 2;
    let bottom = startHeight / 2;

    if (horizontalDirection > 0) {
        right += deltaX;
        if (fromCenter) left -= deltaX;
    } else if (horizontalDirection < 0) {
        left += deltaX;
        if (fromCenter) right -= deltaX;
    }
    if (verticalDirection > 0) {
        bottom += deltaY;
        if (fromCenter) top -= deltaY;
    } else if (verticalDirection < 0) {
        top += deltaY;
        if (fromCenter) bottom -= deltaY;
    }

    let nextWidth = Math.max(minWidth, right - left);
    let nextHeight = Math.max(minHeight, bottom - top);
    if (keepAspectRatio) {
        const horizontalScale = nextWidth / startWidth;
        const verticalScale = nextHeight / startHeight;
        let scale;
        if (horizontalDirection && verticalDirection) {
            scale = Math.abs(horizontalScale - 1) >= Math.abs(verticalScale - 1)
                ? horizontalScale
                : verticalScale;
        } else {
            scale = horizontalDirection ? horizontalScale : verticalScale;
        }
        scale = Math.max(minWidth / startWidth, minHeight / startHeight, scale);
        nextWidth = startWidth * scale;
        nextHeight = startHeight * scale;
    }

    const maxWidth = Number.isFinite(pageWidth) ? Math.max(minWidth, pageWidth) : nextWidth;
    const maxHeight = Number.isFinite(pageHeight) ? Math.max(minHeight, pageHeight) : nextHeight;
    if (keepAspectRatio) {
        const fitScale = Math.min(1, maxWidth / nextWidth, maxHeight / nextHeight);
        nextWidth *= fitScale;
        nextHeight *= fitScale;
    } else {
        nextWidth = Math.min(maxWidth, nextWidth);
        nextHeight = Math.min(maxHeight, nextHeight);
    }

    function placeAxis(size, startSize, axisDirection) {
        if (fromCenter || axisDirection === 0) return [-size / 2, size / 2];
        if (axisDirection > 0) return [-startSize / 2, -startSize / 2 + size];
        return [startSize / 2 - size, startSize / 2];
    }
    [left, right] = placeAxis(nextWidth, startWidth, horizontalDirection);
    [top, bottom] = placeAxis(nextHeight, startHeight, verticalDirection);

    const localCenterX = (left + right) / 2;
    const localCenterY = (top + bottom) / 2;
    const angle = Number(rotation) * Math.PI / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const centerX = Number(x) + startWidth / 2 + localCenterX * cosine - localCenterY * sine;
    const centerY = Number(y) + startHeight / 2 + localCenterX * sine + localCenterY * cosine;
    const maximumX = Number.isFinite(pageWidth) ? Math.max(0, pageWidth - nextWidth) : Number.POSITIVE_INFINITY;
    const maximumY = Number.isFinite(pageHeight) ? Math.max(0, pageHeight - nextHeight) : Number.POSITIVE_INFINITY;

    return {
        x: clamp(centerX - nextWidth / 2, 0, maximumX),
        y: clamp(centerY - nextHeight / 2, 0, maximumY),
        width: nextWidth,
        height: nextHeight
    };
}

function readIndices(element) {
    return {
        dbIdx: Number.parseInt(element.dataset.dbIdx, 10),
        pageIdx: Number.parseInt(element.dataset.pageIdx, 10),
        itemIdx: Number.parseInt(element.dataset.itemIdx, 10)
    };
}

function ensureGuide(documentRef, id, orientation) {
    let guide = documentRef.getElementById(id);
    if (!guide) {
        guide = documentRef.createElement('div');
        guide.id = id;
        guide.className = `magnetic-guide ${orientation} no-print`;
        documentRef.body.appendChild(guide);
    }
    return guide;
}

export function createCanvasInteractionController({
    documentRef = document,
    windowRef = window,
    getItem,
    updateData,
    pushUndo,
    showFormatToolbar = () => {},
    hideFormatToolbar = () => {},
    setSelection = () => {},
    isSnappingEnabled = () => true
}) {
    let lifecycle = null;
    let suppressNextCanvasClick = false;

    function collectSelection() {
        return [...documentRef.querySelectorAll('.data-item.selected-item')].map(element => ({
            element,
            ...readIndices(element)
        }));
    }

    function syncSelectionUi(preferredElement = null) {
        const selected = collectSelection();
        setSelection(selected);
        const single = selected.length === 1 ? selected[0] : null;
        const element = single?.element || preferredElement;
        if (single && element?.querySelector('.text-content') && !element.classList.contains('editing')) {
            showFormatToolbar(element, single.dbIdx, single.pageIdx, single.itemIdx);
        } else hideFormatToolbar();
        return selected;
    }

    function selectElement(element, { additive = false, toggle = false } = {}) {
        if (!additive) {
            documentRef.querySelectorAll('.data-item.selected-item').forEach(selected => {
                if (selected !== element) selected.classList.remove('selected-item');
            });
        }
        if (toggle && element.classList.contains('selected-item')) element.classList.remove('selected-item');
        else element.classList.add('selected-item');
        return syncSelectionUi(element);
    }

    function clearSelection() {
        documentRef.querySelectorAll('.data-item.selected-item').forEach(element => {
            element.classList.remove('selected-item');
        });
        setSelection([]);
        hideFormatToolbar();
    }

    function bindDrag(element, signal) {
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        let hasMoved = false;
        let verticalGuide = null;
        let horizontalGuide = null;
        let dragPageElement = null;
        let snapSiblings = [];

        element.addEventListener('pointerdown', event => {
            if (event.target.closest('.clone-item-btn, .delete-item-btn, .resize-handle')) return;
            if (event.button !== 0 || element.classList.contains('editing') || element.dataset.locked === 'true') return;

            const pageElement = element.closest('.print-page');
            if (!pageElement) return;
            dragPageElement = pageElement;
            snapSiblings = [...pageElement.querySelectorAll('.data-item.draggable')]
                .filter(sibling => sibling !== element)
                .map(sibling => ({
                    left: sibling.offsetLeft,
                    top: sibling.offsetTop,
                    width: sibling.offsetWidth,
                    height: sibling.offsetHeight
                }));

            isDragging = true;
            hasMoved = false;
            element.classList.add('dragging');
            hideFormatToolbar();

            startX = event.clientX;
            startY = event.clientY;
            startLeft = element.offsetLeft;
            startTop = element.offsetTop;

            verticalGuide = ensureGuide(documentRef, 'vGuide', 'vertical');
            horizontalGuide = ensureGuide(documentRef, 'hGuide', 'horizontal');
            pageElement.append(verticalGuide, horizontalGuide);

            element.setPointerCapture(event.pointerId);
            event.stopPropagation();
        }, { signal });

        element.addEventListener('pointermove', event => {
            if (!isDragging) return;

            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;
            if (!hasMoved && Math.hypot(deltaX, deltaY) < 3) return;
            hasMoved = true;

            const pageElement = dragPageElement;
            if (!pageElement) return;

            const maxLeft = Math.max(0, pageElement.clientWidth - element.offsetWidth);
            const maxTop = Math.max(0, pageElement.clientHeight - element.offsetHeight);
            let newLeft = Math.min(maxLeft, Math.max(0, startLeft + deltaX));
            let newTop = Math.min(maxTop, Math.max(0, startTop + deltaY));

            if (isSnappingEnabled()) {
                const snap = findSnapPosition({
                    left: newLeft,
                    top: newTop,
                    width: element.offsetWidth,
                    height: element.offsetHeight,
                    siblings: snapSiblings
                });
                newLeft = snap.left;
                newTop = snap.top;

                if (snap.guideX !== null) {
                    verticalGuide.style.left = `${snap.guideX}px`;
                    verticalGuide.style.display = 'block';
                } else {
                    verticalGuide.style.display = 'none';
                }
                if (snap.guideY !== null) {
                    horizontalGuide.style.top = `${snap.guideY}px`;
                    horizontalGuide.style.display = 'block';
                } else {
                    horizontalGuide.style.display = 'none';
                }
            } else {
                verticalGuide.style.display = 'none';
                horizontalGuide.style.display = 'none';
            }

            element.style.left = `${Math.min(maxLeft, Math.max(0, newLeft))}px`;
            element.style.top = `${Math.min(maxTop, Math.max(0, newTop))}px`;
        }, { signal });

        const endDrag = event => {
            if (!isDragging) return;
            isDragging = false;
            element.classList.remove('dragging');
            if (verticalGuide) verticalGuide.style.display = 'none';
            if (horizontalGuide) horizontalGuide.style.display = 'none';

            const pageElement = dragPageElement;
            dragPageElement = null;
            snapSiblings = [];

            try {
                element.releasePointerCapture(event.pointerId);
            } catch { }
            if (!hasMoved) return;

            if (!pageElement) return;
            const finalX = Number.parseFloat(pxToMmX(element.offsetLeft, pageElement).toFixed(1));
            const finalY = Number.parseFloat(pxToMmY(element.offsetTop, pageElement).toFixed(1));
            element.style.left = `${finalX}mm`;
            element.style.top = `${finalY}mm`;

            const indices = readIndices(element);
            const result = getItem(indices.dbIdx, indices.pageIdx, indices.itemIdx);
            if (!result) return;
            pushUndo();
            result.item.x = finalX;
            result.item.y = finalY;
            updateData(result.data, { silent: true, rerender: false });
        };

        element.addEventListener('pointerup', endDrag, { signal });
        element.addEventListener('pointercancel', endDrag, { signal });
    }

    function bindInlineEditing(element, signal) {
        const textContent = element.querySelector('.text-content');
        if (!textContent) return;
        let modifiedPointerSelection = false;

        element.addEventListener('pointerdown', event => {
            modifiedPointerSelection = event.shiftKey || event.ctrlKey || event.metaKey;
        }, { signal, capture: true });

        element.addEventListener('dblclick', event => {
            event.stopPropagation();
            if (element.classList.contains('editing') || element.dataset.locked === 'true') return;

            element.classList.add('editing');
            textContent.contentEditable = 'true';
            textContent.focus();

            const range = documentRef.createRange();
            range.selectNodeContents(textContent);
            const selection = windowRef.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            const originalText = textContent.textContent;

            function cleanup() {
                textContent.contentEditable = 'false';
                element.classList.remove('editing');
                textContent.removeEventListener('blur', finishEditing);
                textContent.removeEventListener('keydown', onKeyDown);
            }

            function finishEditing() {
                cleanup();
                const newText = textContent.textContent.trim();
                if (!newText) {
                    textContent.textContent = originalText;
                    return;
                }
                if (newText === originalText) return;

                const indices = readIndices(element);
                const result = getItem(indices.dbIdx, indices.pageIdx, indices.itemIdx);
                if (!result) {
                    textContent.textContent = originalText;
                    return;
                }
                pushUndo();
                result.item.text = newText;
                updateData(result.data, { silent: true });
            }

            function cancelEditing() {
                textContent.textContent = originalText;
                cleanup();
            }

            function onKeyDown(keyEvent) {
                if (keyEvent.key === 'Enter') {
                    keyEvent.preventDefault();
                    textContent.blur();
                } else if (keyEvent.key === 'Escape') {
                    cancelEditing();
                }
            }

            textContent.addEventListener('blur', finishEditing);
            textContent.addEventListener('keydown', onKeyDown);
        }, { signal });

        element.addEventListener('click', event => {
            // Biarkan tombol item diteruskan ke event delegation pada container.
            if (event.target.closest('[data-canvas-action]')) return;
            event.stopPropagation();
            const additive = event.shiftKey || event.ctrlKey || event.metaKey;
            selectElement(element, { additive, toggle: additive });
            modifiedPointerSelection = false;
        }, { signal });
        element.addEventListener('focus', () => {
            if (!modifiedPointerSelection && !element.classList.contains('selected-item')) selectElement(element);
        }, { signal });
    }

    function bindResize(handle, signal) {
        const element = handle.closest('.print-item');
        if (!element) return;

        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0 || element.dataset.locked === 'true') return;
            event.stopPropagation();
            event.preventDefault();
            hideFormatToolbar();

            const indices = readIndices(element);
            const pageElement = element.closest('.print-page');
            if (!pageElement) return;

            const startX = event.clientX;
            const startY = event.clientY;
            const startLeft = element.offsetLeft;
            const startTop = element.offsetTop;
            const startWidth = element.offsetWidth;
            const startHeight = element.offsetHeight;
            const direction = handle.dataset.resizeDirection || 'se';
            const result = getItem(indices.dbIdx, indices.pageIdx, indices.itemIdx);
            const rotation = Number(result?.item.rotation) || 0;
            const angle = rotation * Math.PI / 180;
            const cosine = Math.cos(angle);
            const sine = Math.sin(angle);
            let didResize = false;

            element.classList.add('resizing');
            handle.classList.add('active-resize-handle');
            handle.setPointerCapture(event.pointerId);

            function onPointerMove(moveEvent) {
                const screenDeltaX = moveEvent.clientX - startX;
                const screenDeltaY = moveEvent.clientY - startY;
                if (!didResize && Math.hypot(screenDeltaX, screenDeltaY) < 3) return;
                didResize = true;
                const localDeltaX = screenDeltaX * cosine + screenDeltaY * sine;
                const localDeltaY = -screenDeltaX * sine + screenDeltaY * cosine;
                const geometry = calculateResizeGeometry({
                    x: startLeft,
                    y: startTop,
                    width: startWidth,
                    height: startHeight,
                    deltaX: localDeltaX,
                    deltaY: localDeltaY,
                    direction,
                    rotation,
                    keepAspectRatio: moveEvent.shiftKey,
                    fromCenter: moveEvent.altKey,
                    minWidth: APP_CONFIG.MIN_IMAGE_SIZE_PX,
                    minHeight: APP_CONFIG.MIN_IMAGE_SIZE_PX,
                    pageWidth: pageElement.clientWidth,
                    pageHeight: pageElement.clientHeight
                });
                element.style.left = `${geometry.x}px`;
                element.style.top = `${geometry.y}px`;
                element.style.width = `${geometry.width}px`;
                element.style.height = `${geometry.height}px`;
                element.classList.add('sized-text-item');
            }

            function onPointerUp(upEvent) {
                try {
                    handle.releasePointerCapture(upEvent.pointerId);
                } catch { }
                handle.removeEventListener('pointermove', onPointerMove);
                handle.removeEventListener('pointerup', onPointerUp);
                handle.removeEventListener('pointercancel', onPointerUp);
                element.classList.remove('resizing');
                handle.classList.remove('active-resize-handle');
                if (!didResize) return;

                const current = getItem(indices.dbIdx, indices.pageIdx, indices.itemIdx);
                if (!current) return;
                pushUndo();
                const x = Number.parseFloat(pxToMmX(element.offsetLeft, pageElement).toFixed(1));
                const y = Number.parseFloat(pxToMmY(element.offsetTop, pageElement).toFixed(1));
                const width = Number.parseFloat(pxToMmX(element.offsetWidth, pageElement).toFixed(1));
                const height = Number.parseFloat(pxToMmY(element.offsetHeight, pageElement).toFixed(1));
                Object.assign(current.item, { x, y, width, height });
                element.style.left = `${x}mm`;
                element.style.top = `${y}mm`;
                element.style.width = `${width}mm`;
                element.style.height = `${height}mm`;
                updateData(current.data, { silent: true, rerender: false });
                setSelection(collectSelection());
            }

            handle.addEventListener('pointermove', onPointerMove);
            handle.addEventListener('pointerup', onPointerUp);
            handle.addEventListener('pointercancel', onPointerUp);
        }, { signal });
    }

    function bindNonTextSelection(element, signal) {
        if (element.querySelector('.text-content')) return;
        let modifiedPointerSelection = false;
        element.addEventListener('pointerdown', event => {
            modifiedPointerSelection = event.shiftKey || event.ctrlKey || event.metaKey;
        }, { signal, capture: true });
        element.addEventListener('click', event => {
            if (event.target.closest('[data-canvas-action]')) return;
            event.stopPropagation();
            const additive = event.shiftKey || event.ctrlKey || event.metaKey;
            selectElement(element, { additive, toggle: additive });
            modifiedPointerSelection = false;
        }, { signal });
        element.addEventListener('focus', () => {
            if (!modifiedPointerSelection && !element.classList.contains('selected-item')) selectElement(element);
        }, { signal });
    }

    function bindMarquee(pageElement, signal) {
        let gesture = null;

        function getLocalPoint(event) {
            const pageRect = pageElement.getBoundingClientRect();
            return {
                x: clamp(event.clientX - pageRect.left, 0, pageElement.clientWidth),
                y: clamp(event.clientY - pageRect.top, 0, pageElement.clientHeight),
                pageRect
            };
        }

        function findHits(rect, mode, pageRect) {
            return [...pageElement.querySelectorAll('.data-item')].filter(element => {
                const itemRect = element.getBoundingClientRect();
                return isRectSelected({
                    left: itemRect.left - pageRect.left,
                    top: itemRect.top - pageRect.top,
                    right: itemRect.right - pageRect.left,
                    bottom: itemRect.bottom - pageRect.top
                }, rect, mode);
            });
        }

        function clearPreview() {
            pageElement.querySelectorAll('.marquee-candidate, .marquee-remove-candidate').forEach(element => {
                element.classList.remove('marquee-candidate', 'marquee-remove-candidate');
            });
        }

        function cleanup(event) {
            if (!gesture) return;
            clearPreview();
            gesture.box?.remove();
            pageElement.classList.remove('marquee-active');
            try { pageElement.releasePointerCapture(event.pointerId); } catch {}
        }

        pageElement.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.target.closest('.data-item, .page-badge, button, input, select, textarea, a')) return;
            const point = getLocalPoint(event);
            const operation = event.shiftKey ? 'add' : (event.ctrlKey || event.metaKey) ? 'toggle' : 'replace';
            gesture = {
                startX: point.x,
                startY: point.y,
                currentRect: createMarqueeRect(point.x, point.y, point.x, point.y),
                initialSelection: new Set(documentRef.querySelectorAll('.data-item.selected-item')),
                operation,
                mode: 'contain',
                hits: [],
                moved: false,
                box: null
            };
            pageElement.setPointerCapture(event.pointerId);
            event.preventDefault();
        }, { signal });

        pageElement.addEventListener('pointermove', event => {
            if (!gesture) return;
            const point = getLocalPoint(event);
            if (!gesture.moved && Math.hypot(point.x - gesture.startX, point.y - gesture.startY) < 4) return;
            if (!gesture.moved) {
                gesture.moved = true;
                gesture.box = documentRef.createElement('div');
                gesture.box.className = 'marquee-selection-box no-print';
                gesture.box.setAttribute('aria-hidden', 'true');
                pageElement.appendChild(gesture.box);
                pageElement.classList.add('marquee-active');
                hideFormatToolbar();
            }

            gesture.mode = point.x >= gesture.startX ? 'contain' : 'intersect';
            gesture.currentRect = createMarqueeRect(gesture.startX, gesture.startY, point.x, point.y);
            Object.assign(gesture.box.style, {
                left: `${gesture.currentRect.left}px`,
                top: `${gesture.currentRect.top}px`,
                width: `${gesture.currentRect.width}px`,
                height: `${gesture.currentRect.height}px`
            });
            gesture.box.dataset.selectionMode = gesture.mode;
            gesture.box.dataset.selectionOperation = gesture.operation;
            gesture.hits = findHits(gesture.currentRect, gesture.mode, point.pageRect);
            clearPreview();
            gesture.hits.forEach(element => {
                const removing = gesture.operation === 'toggle' && gesture.initialSelection.has(element);
                element.classList.add(removing ? 'marquee-remove-candidate' : 'marquee-candidate');
            });
        }, { signal });

        const finish = (event, apply = true) => {
            if (!gesture) return;
            const completedGesture = gesture;
            cleanup(event);
            gesture = null;
            if (!apply || !completedGesture.moved) return;

            let nextSelection;
            if (completedGesture.operation === 'replace') {
                nextSelection = new Set(completedGesture.hits);
            } else {
                nextSelection = new Set(completedGesture.initialSelection);
                completedGesture.hits.forEach(element => {
                    if (completedGesture.operation === 'toggle' && nextSelection.has(element)) nextSelection.delete(element);
                    else nextSelection.add(element);
                });
            }
            documentRef.querySelectorAll('.data-item.selected-item').forEach(element => element.classList.remove('selected-item'));
            nextSelection.forEach(element => element.classList.add('selected-item'));
            syncSelectionUi(nextSelection.size === 1 ? [...nextSelection][0] : null);
            suppressNextCanvasClick = true;
            windowRef.setTimeout(() => { suppressNextCanvasClick = false; }, 0);
        };

        pageElement.addEventListener('pointerup', event => finish(event), { signal });
        pageElement.addEventListener('pointercancel', event => finish(event, false), { signal });
    }

    function init(rootElement) {
        lifecycle?.abort();
        lifecycle = new AbortController();
        const { signal } = lifecycle;

        rootElement.querySelectorAll('.data-item.draggable').forEach(element => {
            bindDrag(element, signal);
            bindInlineEditing(element, signal);
            bindNonTextSelection(element, signal);
        });
        rootElement.querySelectorAll('.resize-handle').forEach(handle => bindResize(handle, signal));
        rootElement.querySelectorAll('.print-page').forEach(pageElement => bindMarquee(pageElement, signal));

        rootElement.addEventListener('click', event => {
            if (!suppressNextCanvasClick) return;
            suppressNextCanvasClick = false;
            event.preventDefault();
            event.stopPropagation();
        }, { signal, capture: true });

        documentRef.addEventListener('click', event => {
            if (!event.target.closest('.data-item, #propertyPanel, #textFormatToolbar, #canvasContextMenu')) clearSelection();
        }, { signal });
    }

    function destroy() {
        lifecycle?.abort();
        lifecycle = null;
        clearSelection();
    }

    return { clearSelection, destroy, init, selectElement };
}
