// numeric: true змушує колатор порівнювати послідовності цифр як числа,
// тому «2» стає перед «10», а «01» дорівнює «1».
const collator = new Intl.Collator('uk', { numeric: true, sensitivity: 'base' });

export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}
