import {getAllEditor, IEventBusMap, IMenuItem, IProtyle, Plugin, Protyle, showMessage} from "siyuan";
import {
    hasVisibleText,
    HEIMU_BACKGROUND,
    insertToolbarItem,
    isHeimuStyle,
    TOOLBAR_ITEM_NAME,
    TOOLBAR_TIP,
} from "./heimu";
import "./style.css";

interface ToolbarInstance {
    element: HTMLElement;
    range: Range;
}

type ToolbarRender = (this: ToolbarInstance, protyle: IProtyle, ...rest: unknown[]) => unknown;

export default class HeimuPlugin extends Plugin {
    /** The lite editors SiYuan opens inside table cells and database rich-text cells, keyed by their element. */
    private liteEditors = new WeakMap<HTMLElement, IProtyle>();
    private toolbarPrototype: {render: ToolbarRender} | null = null;
    private originalRender: ToolbarRender | null = null;
    private patchedRender: ToolbarRender | null = null;
    private unloaded = false;

    onload() {
        this.addIcons(`<symbol id="iconHeimu" viewBox="0 0 32 32">
            <rect x="3" y="11" width="26" height="10" rx="2"/>
            <path d="M3 5.5h16M3 26.5h20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
        </symbol>`);
        // Also reachable from the command palette, and bindable in 设置 → 快捷键 → 插件.
        this.addCommand({
            langKey: "切换黑幕",
            langText: "切换黑幕",
            hotkey: "",
            editorCallback: (protyle: IProtyle) => this.runCommand(protyle),
        });
        this.eventBus.on("loaded-protyle-static", this.onProtyleLoaded);
    }

    onLayoutReady() {
        const editor = getAllEditor()[0];
        if (editor) {
            this.patchToolbar(editor.protyle.toolbar);
        }
    }

    onunload() {
        this.unloaded = true;
        this.eventBus.off("loaded-protyle-static", this.onProtyleLoaded);
        // Put SiYuan's method back unless another plugin wrapped it after us; then our wrapper stays inert.
        if (this.toolbarPrototype && this.originalRender && this.toolbarPrototype.render === this.patchedRender) {
            this.toolbarPrototype.render = this.originalRender;
        }
        document.querySelectorAll(`.protyle-lite-fragment [data-type="${TOOLBAR_ITEM_NAME}"]`).forEach((button) => button.remove());
    }

    updateProtyleToolbar(toolbar: Array<string | IMenuItem>) {
        return insertToolbarItem<IMenuItem>(toolbar, {
            name: TOOLBAR_ITEM_NAME,
            icon: "iconHeimu",
            tip: TOOLBAR_TIP,
            tipPosition: "n",
            showInLite: true,
            click: (protyle: Protyle) => this.toggle(protyle.protyle, protyle.protyle.toolbar?.range),
        });
    }

    private onProtyleLoaded = (event: CustomEvent<IEventBusMap["loaded-protyle-static"]>) => {
        this.patchToolbar(event.detail.protyle.toolbar);
    };

    /**
     * Table cells and database rich-text cells are edited in lite editors whose toolbars never receive
     * plugin buttons (updateProtyleToolbar only reaches full editors). Every floating toolbar is an instance
     * of the same class, so wrapping its render lets us add the button whenever a lite toolbar appears.
     */
    private patchToolbar(toolbar: unknown) {
        if (this.toolbarPrototype || !toolbar) {
            return;
        }
        const prototype = Object.getPrototypeOf(toolbar) as {render?: unknown} | null;
        if (!prototype || typeof prototype.render !== "function") {
            return;
        }
        const original = prototype.render as ToolbarRender;
        const plugin = this;
        const patched: ToolbarRender = function (protyle, ...rest) {
            const result = original.call(this, protyle, ...rest);
            try {
                plugin.decorateLiteToolbar(this, protyle);
            } catch (error) {
                console.warn(`[${plugin.name}] Could not add the button to a lite toolbar`, error);
            }
            return result;
        };
        prototype.render = patched;
        this.toolbarPrototype = prototype as {render: ToolbarRender};
        this.originalRender = original;
        this.patchedRender = patched;
    }

    private decorateLiteToolbar(toolbar: ToolbarInstance, protyle: IProtyle) {
        if (this.unloaded || !protyle?.lite || !toolbar?.element) {
            return;
        }
        this.liteEditors.set(protyle.element, protyle);
        if (toolbar.element.querySelector(`[data-type="${TOOLBAR_ITEM_NAME}"]`)) {
            return;
        }
        const button = document.createElement("button");
        button.className = "protyle-toolbar__item b3-tooltips b3-tooltips__n";
        button.setAttribute("data-type", TOOLBAR_ITEM_NAME);
        button.setAttribute("aria-label", TOOLBAR_TIP);
        button.innerHTML = '<svg><use xlink:href="#iconHeimu"></use></svg>';
        // Keep the selection inside the cell editor while the button is pressed.
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.toggle(protyle, toolbar.range);
        });
        const mark = toolbar.element.querySelector('[data-type="mark"]');
        if (mark) {
            mark.after(button);
        } else {
            toolbar.element.append(button);
        }
    }

    /** The command fires on the tab's editor; a selection inside a cell belongs to that cell's lite editor. */
    private runCommand(protyle: IProtyle) {
        const range = this.selectionRange();
        const anchor = range?.commonAncestorContainer;
        const element = anchor instanceof Element ? anchor : anchor?.parentElement;
        const liteRoot = element?.closest<HTMLElement>(".protyle-lite-fragment");
        if (!liteRoot) {
            this.toggle(protyle, range);
            return;
        }
        const lite = this.liteEditors.get(liteRoot);
        if (!lite) {
            showMessage("请先选中文字，再点浮动工具栏里的黑幕按钮", 3500, "info");
            return;
        }
        this.toggle(lite, range);
    }

    /**
     * Covers the selection, or uncovers it when everything selected is already covered.
     * With only a caret inside covered text, the whole covered run is uncovered.
     */
    private toggle(protyle: IProtyle, source?: Range | null) {
        const {toolbar, wysiwyg} = protyle;
        if (!toolbar || !wysiwyg) {
            return;
        }
        const root = wysiwyg.element;
        if (!source || !root.contains(source.commonAncestorContainer)) {
            showMessage("先选中要遮住的文字", 3000, "info");
            return;
        }
        const range = source.cloneRange();
        if (range.collapsed) {
            const covered = this.coveredAncestor(range.startContainer, root);
            const [first, last] = covered ? this.coveredRun(covered) : [];
            const firstTexts = first ? this.textNodes(first) : [];
            const lastTexts = last ? this.textNodes(last) : [];
            if (firstTexts.length === 0 || lastTexts.length === 0) {
                showMessage("先选中要遮住的文字", 3000, "info");
                return;
            }
            const end = lastTexts[lastTexts.length - 1];
            range.setStart(firstTexts[0], 0);
            range.setEnd(end, end.length);
            // setInlineMark also reads the live selection, not just toolbar.range, so select the run for real.
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
        }
        // setInlineMark works on toolbar.range; SiYuan splits and merges inline spans and records undo.
        toolbar.range = range;
        if (this.isFullyCovered(range, root)) {
            // Removes only the "text" style type; bold, links and other marks in the selection stay.
            toolbar.setInlineMark(protyle, "clear", "range", {type: "text"});
        } else {
            toolbar.setInlineMark(protyle, "text", "range", {type: "backgroundColor", color: HEIMU_BACKGROUND});
        }
    }

    private selectionRange() {
        const selection = window.getSelection();
        return selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    }

    private isCovered(node: Node | null) {
        return node instanceof HTMLElement && node.matches('span[data-type~="text"]') && isHeimuStyle(node.getAttribute("style"));
    }

    private coveredAncestor(node: Node, root: HTMLElement) {
        for (let element = node instanceof HTMLElement ? node : node.parentElement; element && element !== root; element = element.parentElement) {
            if (this.isCovered(element)) {
                return element;
            }
        }
        return null;
    }

    /**
     * Formatting splits one visual bar into sibling spans (「**加粗**普通」 becomes two), so the run extends
     * over neighbouring covered spans, skipping the zero-width gaps SiYuan leaves between them.
     */
    private coveredRun(span: HTMLElement): [HTMLElement, HTMLElement] {
        const isGap = (node: Node) => node.nodeType === Node.TEXT_NODE && !hasVisibleText(node.textContent ?? "");
        let first = span;
        let last = span;
        for (let node = span.previousSibling; node && (this.isCovered(node) || isGap(node)); node = node.previousSibling) {
            if (this.isCovered(node)) {
                first = node as HTMLElement;
            }
        }
        for (let node = span.nextSibling; node && (this.isCovered(node) || isGap(node)); node = node.nextSibling) {
            if (this.isCovered(node)) {
                last = node as HTMLElement;
            }
        }
        return [first, last];
    }

    private textNodes(container: Node) {
        if (container.nodeType === Node.TEXT_NODE) {
            return [container as Text];
        }
        const texts: Text[] = [];
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            texts.push(node as Text);
        }
        return texts;
    }

    private isFullyCovered(range: Range, root: HTMLElement) {
        const texts = this.textNodes(range.commonAncestorContainer).filter((text) => range.intersectsNode(text));
        // Only the characters actually inside the range count: a selection that starts at the very end of
        // the preceding plain text still "intersects" that node without selecting any of it.
        const selected = (text: Text) => text.data.slice(
            text === range.startContainer ? range.startOffset : 0,
            text === range.endContainer ? range.endOffset : text.data.length,
        );
        const visible = texts.filter((text) => hasVisibleText(selected(text)));
        return visible.length > 0 && visible.every((text) => this.coveredAncestor(text, root) !== null);
    }
}
