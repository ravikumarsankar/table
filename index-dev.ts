import WolfTable, { FormulaTable, h } from './src';

const t = WolfTable.create(
  '#table',
  () => 1400,
  () => 600,
  {
    scrollable: true,
    resizable: true,
    selectable: true,
    editable: true,
    copyable: true,
  }
)
  .freeze('D5')
  .merge('F10:G11')
  .merge('I10:K11')
  .addBorder('E8:L12', 'all', 'medium', '#21ba45')
  .formulaParser((v) => `${v}-formula`)
  .data({
    styles: [
      {
        bold: true,
        strikethrough: true,
        color: '#21ba45',
        italic: true,
        align: 'center',
        fontSize: 12,
      },
    ],
    cells: [
      [0, 0, 'abc'],
      [1, 1, 100],
      [2, 6, { value: 'formula', style: 0 }],
      [9, 5, { value: '', formula: '=sum(A1:A10)' }],
    ],
  })
  .onClick((cell, evt) => {
    // console.log('cell:', cell, evt);
  })
  .onContextmenu((cell, evt) => {
    console.log('contetmenu:', cell);
    const { x, y, width, height } = cell;
    const content = h('div')
      .css({ background: '#ddd', padding: '10px', 'z-index': '100' })
      .css({
        left: x,
        top: y,
        width,
        height,
        position: 'absolute',
      });
    content.html('---abc--');
    t.container().append(content);
  })
  .render();

// add style
const si = t.addStyle({
  bold: true,
  italic: true,
  underline: true,
  color: '#1b1c1d',
});
// set cell
t.cell(2, 2, { value: 'set-value', style: si });
t.cell(15, 7, {
  type: 'text',
  value: 'option',
  options: async (q) =>
    ['option1', 'option2', 'option3', 'option4', 'option5', 'option6'].filter(
      (it) => it.startsWith(q)
    ),
});
t.render();

// get cell
console.log('cell[2,2]:', t.cell(2, 2));

const table = new FormulaTable(5, 5);

// Set some initial values
table.setCell(0, 0, 10); // A1 = 10
table.setCell(0, 1, 20); // B1 = 20
table.setCell(1, 0, 30); // A2 = 30

// Set formulas
table.setCellFormula(2, 0, '=A1+B1'); // A3 = A1 + B1
table.setCellFormula(2, 1, '=A1*A2'); // B3 = A1 * A2
table.setCellFormula(3, 0, '=A3+B3'); // A4 = A3 + B3

// Print the table
for (let i = 0; i < 5; i++) {
  console.log(table['data'][i].slice(0, 5).join('\t'));
}

// Change a cell value
table.setCell(0, 0, 15); // A1 = 15

// Recalculate
table.recalculate();

// Print the updated table
console.log('\nAfter changing A1 to 15:');
for (let i = 0; i < 5; i++) {
  console.log(table['data'][i].slice(0, 5).join('\t'));
}
