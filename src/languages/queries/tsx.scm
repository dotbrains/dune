; A plain identifier has to be painted first: tree-sitter reports two captures
; on the same node in query order, equal-specificity captures paint in that
; order, and a later, more specific pattern below (a JSX tag name, a called
; function, a property) is what has to win over this one. `property_identifier`
; gets the same treatment as `variable.member`, one dot deeper than `variable`:
; a JSX attribute name and a method name are also `property_identifier` nodes,
; so their own captures below are one dot deeper still, or they would lose to
; this one regardless of file order instead of because of it.
(identifier) @variable
(property_identifier) @variable.member

["as" "async" "await" "break" "case" "catch" "class" "const" "continue" "delete" "do" "else" "enum" "export" "extends" "finally" "for" "from" "function" "global" "if" "implements" "import" "interface" "is" "let" "module" "namespace" "new" "object" "override" "private" "protected" "public" "require" "return" "static" "switch" "throw" "try" "type" "var" "while" "with" "yield"] @keyword
["in" "instanceof" "typeof" "keyof" "satisfies"] @keyword.operator
[(true) (false)] @boolean
(comment) @comment
(string) @string
(escape_sequence) @escape
(number) @number
[(null) (undefined)] @constant.builtin
[(type_identifier) (predefined_type)] @type
["{" "}" "(" ")" "[" "]"] @punctuation.bracket
["," ";" ":" "."] @punctuation.delimiter
["+" "-" "*" "/" "%" "**" "=" "+=" "-=" "*=" "/=" "%=" "**=" "==" "===" "!=" "!==" "<" "<=" ">" ">=" "&&" "||" "??" "!" "?" "&&=" "||=" "??=" "&" "|" "^" "~" "<<" ">>" ">>>" "++" "--" "=>" "..." "?." "&=" "|=" "^=" "<<=" ">>=" ">>>="] @operator

; A name is far more useful painted as a function than as a plain variable or
; property, whether it is declared, a method, or called.
(function_declaration name: (identifier) @function)
(function_expression name: (identifier) @function)
(generator_function_declaration name: (identifier) @function)
(method_definition name: (property_identifier) @function.method)

; JSX. Without these every tag and attribute renders as plain text, which is most
; of what a component file looks like.
(jsx_opening_element name: (identifier) @tag)
(jsx_closing_element name: (identifier) @tag)
(jsx_self_closing_element name: (identifier) @tag)
(jsx_opening_element name: (member_expression) @tag)
(jsx_closing_element name: (member_expression) @tag)
(jsx_self_closing_element name: (member_expression) @tag)
; A dotted tag (`<Slider.Root>`) is one `member_expression`, and the broad
; `(identifier) @variable` / `(property_identifier) @variable.member` rules above
; capture its halves too. Groups are painted most-specific-last regardless of query
; order (more dots wins a tie only breaks equal specificity), so plain `@tag` on the
; property half loses outright to `variable.member`'s two segments — `@tag.member`
; matches its specificity and falls back to the same tag colour wherever a theme
; does not give it its own.
(jsx_opening_element name: (member_expression object: (identifier) @tag property: (property_identifier) @tag.member))
(jsx_closing_element name: (member_expression object: (identifier) @tag property: (property_identifier) @tag.member))
(jsx_self_closing_element name: (member_expression object: (identifier) @tag property: (property_identifier) @tag.member))
; The three-deep form (`<A.B.C>`) is the same rule one level down: the outer
; member_expression's object is itself one.
(jsx_opening_element name: (member_expression object: (member_expression object: (identifier) @tag property: (property_identifier) @tag.member) property: (property_identifier) @tag.member))
(jsx_closing_element name: (member_expression object: (member_expression object: (identifier) @tag property: (property_identifier) @tag.member) property: (property_identifier) @tag.member))
(jsx_self_closing_element name: (member_expression object: (member_expression object: (identifier) @tag property: (property_identifier) @tag.member) property: (property_identifier) @tag.member))
(jsx_attribute (property_identifier) @attribute.jsx)
; Bare "<"/">" are covered by the general operator list above already — a
; comparison in a Vue/HTML injection is not inside any jsx_* node, but an
; unwrapped token pattern like this one matches every occurrence in the file,
; not just the ones inside a JSX element, so claiming them here too would win
; a plain `a > b` the same as an actual closing angle bracket.
["</" "/>"] @punctuation.bracket

; Calls, which are as common as tags and were plain too.
(call_expression function: (identifier) @function)
(call_expression function: (member_expression property: (property_identifier) @function.call))
