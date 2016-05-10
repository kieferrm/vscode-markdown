'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TextDocumentContentProvider, EventEmitter, Event, Uri, TextDocumentChangeEvent, TextDocument, ViewColumn } from "vscode";

const hljs = require('highlight.js');

const md = require('markdown-it')({
    highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return `<pre class="hljs"><code>${hljs.highlight(lang, str, true).value}</code></pre>`;
            } catch (error) { }
        }

        return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
    }
});

export function activate(context: vscode.ExtensionContext) {
    let provider = new MDDocumentContentProvider();
    let registration = vscode.workspace.registerTextDocumentContentProvider('markdown', provider);

    let d1 = vscode.commands.registerCommand('extension.previewMarkdown', () => openPreview());
    let d2 = vscode.commands.registerCommand('extension.previewMarkdownSide', () => openPreview(true));

    context.subscriptions.push(d1, d2, registration);

    vscode.workspace.onDidSaveTextDocument((e: TextDocument) => {
        if (isMarkdownFile(e.fileName)) {
          let markdownPreviewUri = Uri.parse(`markdown://${e.uri.path}`);
          provider.update(markdownPreviewUri);
       }
    });
    
    vscode.workspace.onDidChangeConfiguration(() => {
        vscode.workspace.textDocuments.forEach((document) => {
            if ("markdown" === document.uri.scheme) {
                provider.update(document.uri);
            } 
        });
    });
}

function isMarkdownFile(fileName: string) {
    return fileName && (fileName.endsWith('.md') 
          || fileName.endsWith('.mdown')
          || fileName.endsWith('.markdown')
          || fileName.endsWith('.markdn'));
}

function openPreview(sideBySide?: boolean): void {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }

    let markdownPreviewUri = Uri.parse(`markdown://${activeEditor.document.uri.path}`);
    vscode.commands.executeCommand('vscode.previewHtml', markdownPreviewUri, getViewColumn(sideBySide));
}

function getViewColumn(sideBySide): ViewColumn {
    const active = vscode.window.activeTextEditor;
    if (!active) {
        return ViewColumn.One;
    }

    if (!sideBySide) {
        return active.viewColumn;
    }

    switch (active.viewColumn) {
        case ViewColumn.One:
            return ViewColumn.Two;
        case ViewColumn.Two:
            return ViewColumn.Three;
    }

    return active.viewColumn;
}

function fixHref(resource: Uri, href: string) {
    if (href) {

        // Return early if href is already a URL
        if (Uri.parse(href).scheme) {
            return href;
        }

        // Otherwise convert to a file URI by joining the href with the resource location
        return Uri.file(path.join(path.dirname(resource.fsPath), href)).toString();
    }

    return href;
}

class MDDocumentContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();

    public provideTextDocumentContent(uri: Uri): Thenable<string> {
        return new Promise((approve, reject) => {
            fs.readFile(uri.fsPath, (error, buffer) => {
                if (error) {
                    return reject(error);
                }
                
                const res = md.render(buffer.toString());

                const baseCss = `<link rel="stylesheet" type="text/css" href="${path.join(__dirname, '..', '..', 'media', 'markdown.css')}" >`;
                const codeCss = `<link rel="stylesheet" type="text/css" href="${path.join(__dirname, '..', '..', 'media', 'tomorrow.css')}" >`;
                
                let customMDStyles = '';
                const mdStyles = vscode.workspace.getConfiguration("markdown")['styles'];
                if (mdStyles && Array.isArray(mdStyles)) {
                    customMDStyles = mdStyles.map((style) => {
						return `<link rel="stylesheet" href="${fixHref(uri, style)}" type="text/css" media="screen">`;
					}).join('\n')
                }

                approve(baseCss + codeCss + customMDStyles + res);
            });
        });
    }

    get onDidChange(): Event<Uri> {
        return this._onDidChange.event; 
    }

    public update(uri: Uri) {
        this._onDidChange.fire(uri);
    }
}