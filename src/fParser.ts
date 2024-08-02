import Table from '.';

type Operator = '+' | '-' | '*' | '/';
type ExcelFunction = 'SUM' | 'AVERAGE' | 'MIN' | 'MAX' | 'COUNT';

class FParser {
  private table: Table;
  private operators: Record<Operator, (a: number, b: number) => number>;
  private excelFunctions: Record<ExcelFunction, (args: number[]) => number>;

  constructor(table: Table) {
    this.table = table;
    this.operators = {
      '+': (a, b) => a + b,
      '-': (a, b) => a - b,
      '*': (a, b) => a * b,
      '/': (a, b) => a / b,
    };
    this.excelFunctions = {
      SUM: (args) => args.reduce((sum, val) => sum + val, 0),
      AVERAGE: (args) => args.reduce((sum, val) => sum + val, 0) / args.length,
      MIN: (args) => Math.min(...args),
      MAX: (args) => Math.max(...args),
      COUNT: (args) => args.length,
    };
  }

  public parse(formula: string): number {
    formula = formula.replace(/\s+/g, '').toUpperCase();
    if (!formula.startsWith('=')) {
      throw new Error('Formula must start with "="');
    }
    formula = formula.slice(1);
    return this.evaluate(formula);
  }

  private evaluate(expression: string): number {
    const tokens = this.tokenize(expression);
    const postfix = this.infixToPostfix(tokens);
    return this.evaluatePostfix(postfix);
  }

  private tokenize(expression: string): string[] {
    return (
      expression.match(
        /([A-Z]+[0-9]+|\d+|\+|\-|\*|\/|\(|\)|,|[A-Z]+(?=\())/g
      ) || []
    );
  }

  private infixToPostfix(tokens: string[]): string[] {
    const output: string[] = [];
    const stack: string[] = [];
    const precedence: Record<Operator | '(' | ')', number> = {
      '+': 1,
      '-': 1,
      '*': 2,
      '/': 2,
      '(': 0,
      ')': 0,
    };

    for (const token of tokens) {
      if (this.isCellReference(token) || !isNaN(Number(token))) {
        output.push(token);
      } else if (token in this.operators) {
        while (
          stack.length &&
          precedence[stack[stack.length - 1] as Operator] >=
            precedence[token as Operator]
        ) {
          output.push(stack.pop()!);
        }
        stack.push(token);
      } else if (token in this.excelFunctions) {
        stack.push(token);
      } else if (token === '(') {
        stack.push(token);
      } else if (token === ')') {
        while (stack.length && stack[stack.length - 1] !== '(') {
          output.push(stack.pop()!);
        }
        stack.pop(); // Remove '('
        if (stack.length && stack[stack.length - 1] in this.excelFunctions) {
          output.push(stack.pop()!);
        }
      } else if (token === ',') {
        while (stack.length && stack[stack.length - 1] !== '(') {
          output.push(stack.pop()!);
        }
      }
    }

    while (stack.length) {
      output.push(stack.pop()!);
    }

    return output;
  }

  private evaluatePostfix(postfix: string[]): number {
    const stack: number[] = [];

    for (const token of postfix) {
      if (this.isCellReference(token)) {
        stack.push(this.getCellValue(token));
      } else if (!isNaN(Number(token))) {
        stack.push(parseFloat(token));
      } else if (token in this.operators) {
        const b = stack.pop()!;
        const a = stack.pop()!;
        stack.push(this.operators[token as Operator](a, b));
      } else if (token in this.excelFunctions) {
        const args: number[] = [];
        while (stack.length && typeof stack[stack.length - 1] === 'number') {
          args.unshift(stack.pop() as number);
        }
        stack.push(this.excelFunctions[token as ExcelFunction](args));
      }
    }
    return stack[0];
  }

  private isCellReference(token: string): boolean {
    return /^[A-Z]+[0-9]+$/.test(token);
  }

  private getCellValue(cellRef: string): number {
    const col = this.letterToColumn(cellRef.match(/^[A-Z]+/)![0]);
    const row = parseInt(cellRef.match(/[0-9]+$/)![0]) - 1;
    return this.table.getCell(row, col);
  }

  private letterToColumn(letters: string): number {
    let column = 0;
    for (let i = 0; i < letters.length; i++) {
      column +=
        (letters.charCodeAt(i) - 64) * Math.pow(26, letters.length - i - 1);
    }
    return column - 1;
  }
}

export default FParser;
