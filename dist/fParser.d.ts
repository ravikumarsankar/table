import Table from '.';
declare class FParser {
    private table;
    private operators;
    constructor(table: Table);
    parse(formula: string): number;
    private evaluate;
    private tokenize;
    private infixToPostfix;
    private evaluatePostfix;
    private isCellReference;
    private getCellValue;
    private letterToColumn;
}
export default FParser;
