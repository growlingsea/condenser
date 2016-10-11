import React from 'react'
import { Editor, Mark, Raw, Html } from 'slate'
import Portal from 'react-portal'
import position from 'selection-position'

import Icon from 'app/components/elements/Icon';

import demoState from 'app/utils/SlateEditor/DemoState'
import {HtmlRules, schema, getMarkdownType} from 'app/utils/SlateEditor/Schema'

const serializer = new Html({rules: HtmlRules})
export const serializeHtml   = (state) => serializer.serialize(state)
export const deserializeHtml = (html)  => serializer.deserialize(html)
export const getDemoState    = ()      => Raw.deserialize(demoState, { terse: true })

const DEFAULT_NODE = 'paragraph'

let plugins = []


import InsertBlockOnEnter from 'slate-insert-block-on-enter'

if(process.env.BROWSER) {
    //import InsertImages from 'slate-drop-or-paste-images'
    const InsertImages = require('slate-drop-or-paste-images').default

    plugins.push(
        InsertImages({
            extensions: ['jpeg'],
            applyTransform: (transform, file) => {
                return transform.insertBlock({
                    type: 'image',
                    isVoid: true,
                    data: { file }
                })
            }
        })
    )

    plugins.push(
        InsertBlockOnEnter({kind: 'block', type: 'paragraph', nodes: [{kind: 'text', text: '', ranges: []}]})
    )
}


export default class SlateEditor extends React.Component {

    constructor(props) {
        super(props)
        this.state = {state: props.initialState}
    }

    componentDidMount = () => {
        this.updateMenu()
    }

    componentDidUpdate = () => {
        this.updateMenu()
    }

    onChange = (state) => {
        this.setState({ state })
        this.props.onChange(state)
    }

    // When the portal opens, cache the menu element.
    onOpen = (portal) => {
        this.setState({ menu: portal.firstChild })
    }


    // Check if the current selection has a mark with `type` in it.
    hasMark = (type) => {
        const { state } = this.state
        return state.marks.some(mark => mark.type == type)
    }

    // Check if the current selection has a block with `type` in it.
    hasBlock = (type) => {
        const { state } = this.state
        const { document } = state
        return state.blocks.some(node => (node.type == type) || !!document.getClosest(node, parent => parent.type == type) )
    }

    // Check if the current selection has an inline of `type`.
    hasInline = (type) => {
        const { state } = this.state
        return state.inlines.some(inline => inline.type == type)
    }

    // When a mark button is clicked, toggle the current mark.
    onClickMark = (e, type) => {
        e.preventDefault()
        let { state } = this.state

        state = state
            .transform()
            .toggleMark(type)
            .apply()

        this.setState({ state })
    }

    // Toggle block type
    onClickBlock = (e, type) => {
        e.preventDefault()
        let { state } = this.state
        let transform = state.transform()
        const { document } = state

        // Handle everything but list buttons.
        if (type != 'bulleted-list' && type != 'numbered-list') {
            const isActive = this.hasBlock(type)
            const isList = this.hasBlock('list-item')

            if (isList) {
                transform = transform
                    .setBlock(isActive ? DEFAULT_NODE : type)
                    .unwrapBlock('bulleted-list')
                    .unwrapBlock('numbered-list')
            }

            else {
                transform = transform
                    .setBlock(isActive ? DEFAULT_NODE : type)
            }
        }

        // Handle the extra wrapping required for list buttons.
        else {
            const isList = this.hasBlock('list-item')
            const isType = state.blocks.some((block) => {
                return !!document.getClosest(block, parent => parent.type == type)
            })

            if (isList && isType) {
                transform = transform
                    .setBlock(DEFAULT_NODE)
                    .unwrapBlock('bulleted-list')
                    .unwrapBlock('numbered-list')
            } else if (isList) {
              transform = transform
                  .unwrapBlock(type == 'bulleted-list' ? 'numbered-list' : 'bulleted-list')
                  .wrapBlock(type)
            } else {
              transform = transform
                  .setBlock('list-item')
                  .wrapBlock(type)
            }
        }

        state = transform.apply()
        this.setState({ state })
    }

    onClickLink = (e) => {
        e.preventDefault()
        let { state } = this.state
        const hasLinks = this.hasInline('link')

        if (hasLinks) {
console.log(JSON.stringify(Raw.serialize(state, {terse: false})))
            state = state
                .transform()
                .unwrapInline('link')
                .apply()
        }

        else if (state.isExpanded) {
            const href = window.prompt('Enter the URL of the link:')
            if(href) {
                state = state
                    .transform()
                    .wrapInline({
                        type: 'link',
                        data: { href }
                    })
                    .collapseToEnd()
                    .apply()
            }
        }

        else {
          const href = window.prompt('Enter the URL of the link:')
          const text = window.prompt('Enter the text for the link:')
          state = state
              .transform()
              .insertText(text)
              .extendBackward(text.length)
              .wrapInline({
                  type: 'link',
                  data: { href }
              })
              .collapseToEnd()
              .apply()
        }
console.log(JSON.stringify(Raw.serialize(state, {terse: false})))
        this.setState({ state })
    }


    // Markdown-style quick formatting
    onKeyDown = (e, data, state) => {
        switch (data.key) {
            case 'space': return this.onSpace(e, state)
            case 'backspace': return this.onBackspace(e, state)
            case 'enter': return data.isShift ? this.onShiftEnter(e, state) : this.onEnter(e, state)
        }
    }

    // If space was entered, check if it was a markdown sequence
    onSpace = (e, state) => {
        if (state.isExpanded) return
        let { selection } = state
        const { startText, startBlock, startOffset } = state
        const chars = startBlock.text.slice(0, startOffset)//.replace(/\s*/g, '')
        const type = getMarkdownType(chars)

        if (!type) return
        if (type == 'list-item' && startBlock.type == 'list-item') return
        e.preventDefault()

        let transform = state
            .transform()
            .setBlock(type)

        if (type == 'list-item' && chars != '1.') transform = transform.wrapBlock('bulleted-list')
        if (type == 'list-item' && chars == '1.') transform = transform.wrapBlock('numbered-list')

        state = transform
            .extendToStartOf(startBlock)
            .delete()
            .apply()

        return state
    }

    // On backspace, if at the start of a non-paragraph, convert it back into a paragraph node.
    onBackspace = (e, state) => {
        if (state.isExpanded) return
        if (state.startOffset != 0) return
        const { startBlock } = state

        if (startBlock.type == 'paragraph') return
        e.preventDefault()

        let transform = state
            .transform()
            .setBlock('paragraph')

        if (startBlock.type == 'list-item')
            transform = transform
                .unwrapBlock('bulleted-list')
                .unwrapBlock('numbered-list')

        state = transform.apply()
        return state
    }

    onShiftEnter = (e, state) => {
        if (state.isExpanded) return
        const { startBlock, startOffset, endOffset } = state

        // Allow soft returns for certain block types
        if (startBlock.type == 'code-block' || startBlock.type == 'block-quote') {
            let transform = state.transform()
            if (state.isExpanded) transform = transform.delete()
            transform = transform.insertText('\n')
            return transform.apply()
        }
    }

    onEnter = (e, state) => {
        if (state.isExpanded) return
        const { startBlock, startOffset, endOffset } = state

        // On return, if at the end of a node type that should not be extended, create a new paragraph below it.
        if (startOffset == 0 && startBlock.length == 0) return this.onBackspace(e, state) //empty block
        if (endOffset != startBlock.length) return //not at end of block

        if (
            startBlock.type != 'heading-one' &&
            startBlock.type != 'heading-two' &&
            startBlock.type != 'heading-three' &&
            startBlock.type != 'heading-four' &&
            startBlock.type != 'block-quote' &&
            startBlock.type != 'code-block'
        ) return

        e.preventDefault()
        return state
            .transform()
            .splitBlock()
            .setBlock('paragraph')
            .apply()
    }

    render = () => {
        const { state } = this.state
        return (
            <div>
                {this.renderMenu()}
                {this.renderEditor()}
            </div>
        )
    }

    renderMenu = () => {
        const { state } = this.state
        const isOpen = state.isExpanded && state.isFocused

        return (
            <Portal isOpened onOpen={this.onOpen}>
                <div className="SlateEditor__menu SlateEditor__menu">
                    {schema.toolbarMarks.map(this.renderMarkButton)}
                    {this.renderInlineButton({type: 'link', label: <Icon name="link" />})}
                    {this.renderBlockButton({type: 'block-quote', label: <span>&ldquo;</span>})}
                    {this.renderBlockButton({type: 'heading-one', label: 'H1'})}
                    {this.renderBlockButton({type: 'heading-two', label: 'H2'})}
                    {this.renderBlockButton({type: 'bulleted-list', label: 'ul'})}
                    {this.renderBlockButton({type: 'numbered-list', label: 'ol'})}
                    {this.renderBlockButton({type: 'code-block', label: '<>'})}
                </div>
            </Portal>
        )
    }

    renderMarkButton = (props) => {
        const {type, label} = props
        const isActive = this.hasMark(type)
        const onMouseDown = e => this.onClickMark(e, type)

        return (
            <span key={type} className={'SlateEditor__menu-button SlateEditor__menu-button-'+type} onMouseDown={onMouseDown} data-active={isActive}>
                <span>{label}</span>
            </span>
        )
    }

    renderBlockButton = (props) => {
        const {type, label} = props
        const isActive = this.hasBlock(type)
        const onMouseDown = e => this.onClickBlock(e, type)

        return (
            <span key={type} className={'SlateEditor__menu-button SlateEditor__menu-button-'+type} onMouseDown={onMouseDown} data-active={isActive}>
                <span>{label}</span>
            </span>
        )
    }

    renderInlineButton = (props) => {
        const {type, label} = props
        const isActive = this.hasInline(type)
        const onMouseDown = e => this.onClickLink(e, type)

        return (
            <span key={type} className={'SlateEditor__menu-button SlateEditor__menu-button-'+type} onMouseDown={onMouseDown} data-active={isActive}>
                <span>{label}</span>
            </span>
        )
    }

    renderEditor = () => {
        return (
            <div className="SlateEditor Markdown">
                <Editor
                    schema={schema}
                    plugins={plugins}
                    state={this.state.state}
                    onChange={this.onChange}
                    onKeyDown={this.onKeyDown}
                />
            </div>
        )
    }

    updateMenu = () => {
        const { menu, state } = this.state
        if (!menu) return

        if (state.isBlurred || state.isCollapsed) {
          menu.removeAttribute('style')
          return
        }

        const rect = position()
        menu.style.opacity = 1
        menu.style.top = `${rect.top + window.scrollY - menu.offsetHeight}px`
        menu.style.left = `${rect.left + window.scrollX - menu.offsetWidth / 2 + rect.width / 2}px`
    }
}