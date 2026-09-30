/**
 * The blackout is stored as an ordinary SiYuan inline text style whose background references an inline-style
 * palette variable: background-color: var(--b3-inline-style-<id>-background-color, #808080).
 *
 * That exact shape (a node-ID-like style id plus a #rrggbb fallback) is what SiYuan keeps when table cells and
 * database rich-text cells are written back; any other custom value is stripped there. SiYuan defines no such
 * variable for this id, so without the plugin the mid-grey fallback shows and the text stays readable.
 */
export const HEIMU_STYLE_ID = "20260930000000-heimu00";
export const HEIMU_FALLBACK = "#808080";
export const HEIMU_MARKER = `--b3-inline-style-${HEIMU_STYLE_ID}-`;
export const HEIMU_BACKGROUND = `var(${HEIMU_MARKER}background-color, ${HEIMU_FALLBACK})`;
/** v0.1.0 wrote var(--siyuan-heimu); those spans are still recognised. */
export const LEGACY_MARKER = "--siyuan-heimu";
export const TOOLBAR_ITEM_NAME = "siyuan-heimu";
export const TOOLBAR_TIP = "黑幕（鼠标移上去才显示）";

export const isHeimuStyle = (style: string | null | undefined) =>
    Boolean(style && (style.includes(HEIMU_MARKER) || style.includes(LEGACY_MARKER)));

/**
 * Places the button right after the highlight button, or at the end when the toolbar has no highlight.
 * By the time plugins see it, SiYuan has already expanded built-in entries into {name, icon, ...} objects;
 * only separators stay plain "|" strings.
 */
export const insertToolbarItem = <T extends {name: string}>(toolbar: Array<string | T>, item: T, after = "mark") => {
    const next = [...toolbar];
    const index = next.findIndex((entry) => (typeof entry === "string" ? entry : entry.name) === after);
    next.splice(index >= 0 ? index + 1 : next.length, 0, item);
    return next;
};

/** Text that counts as content; SiYuan pads inline elements with zero-width spaces. */
export const hasVisibleText = (text: string) => text.replace(/[​\s]/g, "").length > 0;
