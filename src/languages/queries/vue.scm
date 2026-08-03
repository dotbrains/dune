(comment) @comment
(tag_name) @tag
[(attribute_name) (directive_name)] @attribute
[(directive_argument) (directive_modifier)] @property
[(quoted_attribute_value) (attribute_value)] @string
(interpolation) @embedded
["<" ">" "</" "/>"] @punctuation.bracket
"=" @operator

(script_element (raw_text) @injection.typescript)
(style_element (raw_text) @injection.css)
(interpolation (raw_text) @injection.typescript)
