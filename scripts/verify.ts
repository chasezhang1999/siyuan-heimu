import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
    hasVisibleText,
    HEIMU_BACKGROUND,
    HEIMU_MARKER,
    insertToolbarItem,
    isHeimuStyle,
    LEGACY_MARKER,
} from "../src/heimu.ts";

// SiYuan 3.8.6 keeps only this shape of custom colour when a table cell or database rich-text cell is written
// back (copied from its bundle); anything else, like the v0.1.0 var(--siyuan-heimu), is stripped there.
const SIYUAN_INLINE_STYLE = /^var\(--b3-inline-style-([0-9]{14}-[a-z0-9]{7})-(color|background-color),\s*(#[0-9A-Fa-f]{6})\)$/;
assert.match(HEIMU_BACKGROUND, SIYUAN_INLINE_STYLE);
assert.equal(HEIMU_BACKGROUND, "var(--b3-inline-style-20260930000000-heimu00-background-color, #808080)");

// The marker as SiYuan writes it into the span's style attribute, old and new forms.
assert.ok(isHeimuStyle(`background-color: ${HEIMU_BACKGROUND};`));
assert.ok(isHeimuStyle("background-color: var(--siyuan-heimu);"));
assert.ok(isHeimuStyle(`color: var(--b3-font-color1); background-color: ${HEIMU_BACKGROUND};`));
assert.equal(isHeimuStyle("background-color: var(--b3-font-background1);"), false);
assert.equal(isHeimuStyle("background-color: var(--b3-inline-style-20260101000000-abcdefg-background-color, #111111);"), false);
assert.equal(isHeimuStyle(null), false);
assert.equal(isHeimuStyle(""), false);

// The button goes right after 高亮 (mark), or last when there is no mark button.
const item = {name: "siyuan-heimu"};
assert.deepEqual(insertToolbarItem(["strong", "mark", "sup"], item), ["strong", "mark", item, "sup"]);
assert.deepEqual(insertToolbarItem(["strong", "em"], item), ["strong", "em", item]);
// What SiYuan 3.8.x actually passes: expanded objects, with "|" separators left as strings.
const s = {name: "s"}, mark = {name: "mark"}, sup = {name: "sup"};
assert.deepEqual(insertToolbarItem<{name: string}>([s, mark, sup, "|"], item), [s, mark, item, sup, "|"]);
const original = ["mark"];
insertToolbarItem(original, item);
assert.deepEqual(original, ["mark"], "the toolbar passed in is not mutated");

assert.equal(hasVisibleText("​ \n"), false);
assert.ok(hasVisibleText("​剧透"));

// The stylesheet targets both markers and reveals on hover.
const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
assert.ok(css.includes(`[style*="${HEIMU_MARKER}"]`));
assert.ok(css.includes(`[style*="${LEGACY_MARKER}"]`));
assert.match(css, /:hover\s*\{\s*color: #fff !important;/);

console.log("Verified: SiYuan-compatible marker, legacy marker, toolbar placement and stylesheet selectors.");
