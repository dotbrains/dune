(comment) @comment
(tag_name) @tag
; A shorthand directive parses as a one-character directive_name and a
; directive_argument holding the word, so capturing the argument apart from
; the name painted `:` and `title` in two colours — `:title` beside a plain
; `class` reads as two kinds of thing where VS Code reads one.
[(attribute_name) (directive_name) (directive_argument) (directive_modifier)] @attribute
[(quoted_attribute_value) (attribute_value)] @string
(interpolation) @embedded
["<" ">" "</" "/>"] @punctuation.bracket
"=" @operator

(script_element (raw_text) @injection.typescript)
(style_element (raw_text) @injection.css)
(interpolation (raw_text) @injection.typescript)
; A directive's value is an expression, not a string: `v-if="a > b"`,
; `:class="{ on: isOn }"`, `@click="go()"`. A plain attribute's value stays the
; string it is. The @string above still covers the whole of it, which is what
; the quotes keep, and what a value the typescript grammar makes nothing of
; falls back to.
(directive_attribute (quoted_attribute_value (attribute_value) @injection.typescript))
