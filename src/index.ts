import './style.index.less';
import { stylePrefix } from './config';
import HElement, { h } from './element';
import Scrollbar from './scrollbar';
import Resizer from './resizer';
import Selector from './selector';
import Overlayer from './overlayer';
import Editor from './editor';
import TableRenderer, {
  Style,
  ColHeader,
  RowHeader,
  Range,
  Rect,
  Border,
  Formatter,
  expr2xy,
  Gridline,
  ViewportCell,
  Cell,
} from '@wolf-table/table-renderer';
import {
  defaultData,
  TableData,
  row,
  col,
  colsWidth,
  rowsHeight,
  rowHeight,
  colWidth,
  merge,
  unmerge,
  isMerged,
  cellValue,
  Cells,
  FormulaParser,
  DataCell,
  addStyle,
  clearStyles,
  addBorder,
  clearBorder,
  clearBorders,
  DataRow,
  DataCol,
  DataCellValue,
  cellValueString,
  isLastRow,
  isLastCol,
  copy,
} from './data';
import resizer from './index.resizer';
import scrollbar from './index.scrollbar';
import selector from './index.selector';
import { initEvents } from './index.event';
import { fromHtml, toHtml } from './index.html';
import { getStyle } from './data/style';
import { CopyData } from './data/copy';
import { EventEmitter } from './event';
import TextEditor from './editor/text';

import FParser from './fParser';

export type TableRendererOptions = {
  style?: Partial<Style>;
  headerStyle?: Partial<Style>;
  rowHeader?: Partial<RowHeader>;
  colHeader?: Partial<ColHeader>;
  gridline?: Partial<Gridline>;
  headerGridline?: Partial<Gridline>;
  freeGridline?: Partial<Gridline>;
};

export type TableDataOptions = {
  rows?: number;
  cols?: number;
  rowHeight?: number;
  colWidth?: number;
};

export type TableOptions = {
  minRowHeight?: number;
  minColWidth?: number;
  scrollable?: boolean;
  resizable?: boolean;
  selectable?: boolean;
  editable?: boolean;
  copyable?: boolean;
  data?: TableDataOptions;
  renderer?: TableRendererOptions;
};

export type MoveDirection = 'up' | 'down' | 'left' | 'right';

export { HElement, h };

export default class Table {
  // renderer options
  _rendererOptions: TableRendererOptions = {};

  _copyable = false;

  _editable = false;

  _minRowHeight: number = 25;

  _minColWidth: number = 60;

  _width: () => number;

  _height: () => number;

  // cache for rect of content
  _contentRect: Rect = { x: 0, y: 0, width: 0, height: 0 };

  _container: HElement;

  _data: TableData;

  _renderer: TableRenderer;

  _cells = new Cells();

  _tooltip: TableTooltip;

  // scrollbar
  _vScrollbar: Scrollbar | null = null;
  _hScrollbar: Scrollbar | null = null;

  // resizer
  _rowResizer: Resizer | null = null;
  _colResizer: Resizer | null = null;

  // editor ? extends Editor
  _editor: Editor | null = null;
  _editors = new Map();

  _selector: Selector | null = null;
  _restrictFillRange: boolean = false;
  _overlayer: Overlayer;

  _canvas: HElement;

  // event emitter
  _emitter = new EventEmitter();

  _cdata: number[][];
  _formulas: (string | null)[][];
  _formulaParser: FParser;

  constructor(
    element: HTMLElement | string,
    width: () => number,
    height: () => number,
    options?: TableOptions
  ) {
    this._width = width;
    this._height = height;
    const container: HTMLElement | null =
      typeof element === 'string' ? document.querySelector(element) : element;
    if (container === null) throw new Error('first argument error');
    this._container = h(container, `${stylePrefix}-container`).css({
      height: height(),
      width: width(),
    });
    this._data = defaultData();

    this._cdata = Array()
      .fill(null)
      .map(() => Array().fill(0));
    this._formulas = Array()
      .fill(null)
      .map(() => Array().fill(null));
    this._formulaParser = new FParser(this);
    // update default data
    if (options) {
      const { minColWidth, minRowHeight, renderer, data } = options;
      if (minColWidth) this._minColWidth = minColWidth;
      if (minRowHeight) this._minRowHeight = minRowHeight;

      if (renderer) {
        this._rendererOptions = renderer;
      }

      if (data) {
        const { cols, rows, rowHeight, colWidth } = data;
        const { _data } = this;
        if (cols) _data.cols.len = cols;
        if (rows) _data.rows.len = rows;
        if (rowHeight) _data.rowHeight = rowHeight;
        if (colWidth) _data.colWidth = colWidth;
      }
    }

    const canvasElement = document.createElement('canvas');
    // tabIndex for trigger keydown event
    this._canvas = h(canvasElement).attr('tabIndex', '1');
    this._container.append(canvasElement);
    this._renderer = new TableRenderer(canvasElement, width(), height());
    this._overlayer = new Overlayer(this._container);
    this._tooltip = new TableTooltip(this._container);

    // resize rect of content
    resizeContentRect(this);

    if (options?.selectable) {
      selector.init(this);
    }

    // scroll
    if (options?.scrollable) {
      scrollbar.init(this);
    }

    if (options?.resizable) {
      resizer.init(this);
    }

    if (options?.editable) {
      this._editable = true;
    }

    this._copyable = options?.copyable || false;

    this._editor = new TextEditor();

    // set editors
    this._editors.set('text', this._editor);

    initEvents(this);

    this.onEditorValueChange((cell, value: DataCell) => {
      // assign the cell formula
      if (typeof value === 'string' && value.startsWith('=')) {
        this.setCellFormula(cell.row, cell.col, value);
      }
      this.recalculate();
      this.render();
    });

    this.onSelectValueChange((cell: ViewportCell) => {
      const formula = this.getCellFormula(cell.row, cell.col);
      if (formula) {
        this._tooltip.show(cell, formula);
      } else {
        this._tooltip.hide();
      }
    });

    this.onKeyDown((row, col, cell) => {
      const formula = this.getCellFormula(row, col);
      console.log('key', row, col, cell);
      console.log('formula', formula);
      if (formula) {
        this._tooltip.show(cell, formula);
      } else {
        this._tooltip.hide();
      }
    });
  }

  onSelectValueChange(handler: (cell: ViewportCell) => void) {
    this._emitter.on('click', handler);
    return this;
  }

  onEditorValueChange(
    handler: (cell: { row: number; col: number }, value: DataCell) => void
  ) {
    this._emitter.on('editorValueChange', handler);
    return this;
  }

  onKeyDown(handler: (row: number, col: number, cell: ViewportCell) => void) {
    this._emitter.on('key', handler);
    return this;
  }

  contentRect() {
    return this._contentRect;
  }

  container() {
    return this._container;
  }

  resize() {
    this._container.css({ height: this._height(), width: this._width() });
    this._renderer.width(this._width());
    this._renderer.height(this._height());
    this.render();
  }

  freeze(ref: string) {
    this._data.freeze = ref;
    return this;
  }

  isMerged(): boolean;
  isMerged(ref: string): boolean;
  isMerged(ref?: string) {
    if (ref) return isMerged(this._data, ref);
    else {
      const { _selector } = this;
      if (_selector) {
        return _selector._ranges.every((it) =>
          isMerged(this._data, it.toString())
        );
      }
    }
    return false;
  }

  merge(): Table;
  // ref: A1 | A1:B10
  merge(ref: string): Table;
  merge(ref?: string) {
    if (ref) merge(this._data, ref);
    else {
      const { _selector } = this;
      if (_selector) {
        _selector._ranges.forEach((it) => merge(this._data, it.toString()));
      }
    }
    return this;
  }

  unmerge(): Table;
  // ref: A1 | A1:B10
  unmerge(ref: string): Table;
  unmerge(ref?: string) {
    if (ref) unmerge(this._data, ref);
    else {
      const { _selector } = this;
      if (_selector) {
        _selector._ranges.forEach((it) => unmerge(this._data, it.toString()));
      }
    }
    return this;
  }

  row(index: number): DataRow;
  row(index: number, value: Partial<DataRow>): Table;
  row(index: number, value?: Partial<DataRow>): any {
    if (value) {
      if (value.height) {
        this.rowHeight(index, value.height);
      }
      row(this._data, index, value);
      return this;
    }
    return row(this._data, index);
  }

  rowHeight(index: number): number;
  rowHeight(index: number, value: number): Table;
  rowHeight(index: number, value?: number): any {
    const oldValue = rowHeight(this._data, index);
    if (value) {
      if (oldValue !== value) {
        rowHeight(this._data, index, value);
        this._contentRect.height += value - oldValue;
      }
      return this;
    }
    return oldValue;
  }

  rowsHeight(min: number, max: number) {
    return rowsHeight(this._data, min, max);
  }

  isLastRow(index: number) {
    return isLastRow(this._data, index);
  }

  col(index: number): DataCol;
  col(index: number, value: Partial<DataCol>): Table;
  col(index: number, value?: Partial<DataCol>): any {
    if (value) {
      if (value.width) {
        this.colWidth(index, value.width);
      }
      col(this._data, index, value);
      return this;
    }
    return col(this._data, index);
  }

  colWidth(index: number): number;
  colWidth(index: number, value: number): Table;
  colWidth(index: number, value?: number): any {
    const oldValue = colWidth(this._data, index);
    if (value) {
      if (oldValue !== value) {
        colWidth(this._data, index, value);
        this._contentRect.width += value - oldValue;
      }
      return this;
    }
    return oldValue;
  }

  colsWidth(min: number, max: number) {
    return colsWidth(this._data, min, max);
  }

  isLastCol(index: number) {
    return isLastCol(this._data, index);
  }

  formulaParser(v: FormulaParser) {
    this._cells.formulaParser(v);
    return this;
  }

  formatter(v: Formatter) {
    this._cells.formatter(v);
    return this;
  }

  style(index: number, withDefault = true) {
    return getStyle(this._data, index, withDefault);
  }

  addStyle(value: Partial<Style>): number {
    return addStyle(this._data, value);
  }

  clearStyles() {
    clearStyles(this._data);
    return this;
  }

  addBorder(...value: Border) {
    addBorder(this._data, value);
    return this;
  }

  clearBorder(value: string) {
    clearBorder(this._data, value);
    return this;
  }

  clearBorders() {
    clearBorders(this._data);
    return this;
  }

  cell(row: number, col: number): DataCell;
  cell(row: number, col: number, value: DataCell): Table;
  cell(row: number, col: number, value?: DataCell): any {
    const { _cells } = this;
    if (value) {
      const oldValue = _cells.get(row, col);
      _cells.set(row, col, value);
      if (typeof value === 'number') {
        this._cdata[row][col] = value;
      }
      // Trigger _handleEditorValueChange if the value has changed
      if (oldValue !== value) {
        this._emitter.emit('editorValueChange', { row, col }, value);
      }
      return this;
    }
    const v = _cells.get(row, col);
    return v != null ? v[2] : v;
  }

  cellValue(row: number, col: number) {
    return cellValue(this.cell(row, col));
  }

  cellValueString(row: number, col: number) {
    return cellValueString(this.cell(row, col));
  }

  render() {
    const { _data, _renderer, _overlayer } = this;
    for (let prop in this._rendererOptions) {
      const propValue = (this._rendererOptions as any)[prop];
      if (propValue) (_renderer as any)[prop](propValue);
    }

    _renderer
      .scrollRows(_data.scroll[0])
      .scrollCols(_data.scroll[1])
      .merges(_data.merges)
      .freeze(_data.freeze)
      .styles(_data.styles)
      .borders(_data.borders)
      .rows(_data.rows.len)
      .cols(_data.cols.len)
      .row((index) => row(_data, index))
      .col((index) => col(_data, index))
      .cell((r, c) => {
        return this.cell(r, c);
      })
      .formatter(this._cells._formatter)
      .render();

    // viewport
    const { viewport } = _renderer;
    if (viewport) {
      viewport.areas.forEach((rect, index) => {
        _overlayer.area(index, rect);
      });
      viewport.headerAreas.forEach((rect, index) => {
        _overlayer.headerArea(index, rect);
      });
      scrollbar.resize(this);
    }
    this.bloatCellData();
    return this;
  }

  data(): TableData;
  data(data: Partial<TableData>): Table;
  data(data?: any): any {
    if (data) {
      Object.assign(this._data, data);
      this._cells.load(this._data);
      this.bloatCellData(this._data);
      resizeContentRect(this);
      return this;
    } else {
      return this._data;
    }
  }

  bloatCellData(data?: TableData) {
    if (this._cdata.length == 0) {
      for (let row = 0; row < this._data.rows.len; row++) {
        this._cdata[row] = [];
        this._formulas[row] = [];
        for (let col = 0; col < this._data.cols.len; col++) {
          this._cdata[row][col] = this.getCell(row, col);
          this._formulas[row][col] = this.getCellFormula(row, col);
        }
      }
    }
    if (data?.cells) {
      for (let cellId = 0; cellId < data.cells.length; cellId++) {
        this.cell(
          data.cells[cellId][0],
          data.cells[cellId][1],
          data.cells[cellId][2]
        );
      }
    }
  }

  /**
   * copy data to ...
   * @param to
   * @param autofill
   */
  copy(to: string | Range | Table | null, autofill = false) {
    if (!to) return this;
    const toCopyData = (range: string | Range, t: Table) => {
      return {
        range: typeof range === 'string' ? Range.with(range) : range,
        cells: t._cells,
        data: t._data,
      };
    };
    const toCopyData1 = (t: Table): CopyData | null => {
      const { _selector } = t;
      if (!_selector) return null;
      const range = _selector.currentRange;
      if (range === undefined) return null;
      return toCopyData(range, t);
    };

    copy(
      toCopyData1(this),
      to instanceof Table ? toCopyData1(to) : toCopyData(to, this),
      autofill
    );
    return this;
  }

  /**
   * @param html <table><tr><td style="color: white">test</td></tr></table>
   * @param to A1 or B9
   */
  fill(html: string): Table;
  fill(html: string, to: string): Table;
  fill(arrays: DataCellValue[][]): Table;
  fill(arrays: DataCellValue[][], to: string): Table;
  fill(data: any, to?: string): Table {
    const { _selector } = this;
    let [startRow, startCol] = [0, 0];
    if (to) {
      [startCol, startRow] = expr2xy(to);
    } else {
      if (!_selector) return this;
      [startRow, startCol] = _selector._focus;
    }
    let [endRow, endCol] = [0, 0];
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i += 1) {
        const row = data[i];
        endCol = startCol + row.length - 1;
        for (let j = 0; j < row.length; j += 1) {
          this.cell(startRow + i, startCol + j, row[j]);
        }
      }
      endRow = startRow + data.length - 1;
    } else if (typeof data === 'string') {
      [endRow, endCol] = fromHtml(this, data, [startRow, startCol]);
    }
    if (endRow > 0 || endCol > 0) {
      selector.unionRange(this, endRow, endCol);
      selector.reset(this);
    }
    return this;
  }

  /**
   * @param from A1:H12
   */
  toHtml(from: string): string {
    return toHtml(this, from);
  }

  toArrays(from: string): DataCellValue[][] {
    const range = Range.with(from);
    const arrays: DataCellValue[][] = [];
    range.eachRow((r) => {
      const a: DataCellValue[] = [];
      range.eachCol((c) => {
        a.push(this.cellValue(r, c));
      });
      arrays.push(a);
    });
    return arrays;
  }

  onClick(handler: (cell: ViewportCell, evt: MouseEvent) => void) {
    this._emitter.on('click', handler);
    return this;
  }

  onContextmenu(handler: (cell: ViewportCell, evt: MouseEvent) => void) {
    this._emitter.on('contextmenu', handler);
    return this;
  }

  getCell(row: number, col: number): number {
    return this._cdata[row][col];
  }

  getCellFormula(row: number, col: number): string | null {
    return this._formulas[row][col];
  }

  setCellFormula(row: number, col: number, formula: string): void {
    this._formulas[row][col] = formula;
    const result = this._formulaParser.parse(formula);

    this._cdata[row][col] = result;
    this.cell(row, col, result);
  }

  recalculate(): void {
    for (let row = 0; row < this._cdata.length; row++) {
      for (let col = 0; col < this._cdata[row].length; col++) {
        if (this._formulas[row][col]) {
          const result = this._formulaParser.parse(this._formulas[row][col]!);
          this._cdata[row][col] = result;
        }
      }
    }
  }

  /**
   * @param type keyof cell.type
   * @param editor
   * @returns
   */
  addEditor(type: string, editor: Editor) {
    this._editors.set(type, editor);
    return this;
  }

  static create(
    element: HTMLElement | string,
    width: () => number,
    height: () => number,
    options?: TableOptions
  ): Table {
    return new Table(element, width, height, options);
  }
}

function resizeContentRect(t: Table) {
  t._contentRect = {
    x: t._renderer._rowHeader.width,
    y: t._renderer._colHeader.height,
    width: colsWidth(t._data),
    height: rowsHeight(t._data),
  };
}

export class TableTooltip {
  private _container: HElement;
  private _tooltip: HElement;

  constructor(container: HElement) {
    this._container = container;
    this._tooltip = this._createTooltip();
    this._container.append(this._tooltip);
  }

  private _createTooltip(): HElement {
    return h('div').css({
      position: 'absolute',
      color: 'grey',
      padding: '5px',
      borderRadius: '3px',
      fontSize: '8px',
      zIndex: '1000',
      display: 'none',
      'background-color': 'lightblue',
    });
  }

  show(cell: ViewportCell, formula: string): void {
    const { x, y, width } = cell;
    this._tooltip.html(formula).css({
      left: x + 25,
      top: y - 25,
      maxWidth: width,
      display: 'block',
    });
  }

  hide(): void {
    this._tooltip.css('display', 'none');
  }
}

declare global {
  interface Window {
    wolf: any;
  }
}

if (window) {
  window.wolf ||= {};
  window.wolf.table = Table.create;
}
