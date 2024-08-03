import Table from '.';
declare class FParser {
    private table;
    private operators;
    private excelFunctions;
    constructor(table: Table);
    parse(formula: string): number;
    private evaluate;
    private tokenize;
    private infixToPostfix;
    private evaluatePostfix;
    private isCellReference;
    private isCellRange;
    private getCellValue;
    private getCellRangeValues;
    private getRange;
    private letterToColumn;
}
export default FParser;
