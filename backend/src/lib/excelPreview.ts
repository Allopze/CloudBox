import ExcelJS from 'exceljs';

export interface ExcelHtmlPreview {
  html: string;
  sheetNames: string[];
  currentSheet: number;
}

const sanitizeHex = (value: string): string | null => {
  const trimmed = value.trim();
  if (!/^[0-9a-fA-F]{6,8}$/.test(trimmed)) return null;
  return trimmed.length === 8 ? trimmed.substring(2) : trimmed;
};

const argbToHex = (argb: string | undefined): string | null => {
  if (!argb) return null;
  const hex = sanitizeHex(argb);
  return hex ? `#${hex}` : null;
};

const sanitizeCssValue = (value: string): string | null => {
  const cleaned = value.replace(/[^a-zA-Z0-9 ,_-]/g, '').trim();
  return cleaned.length > 0 ? cleaned : null;
};

const normalizeHorizontalAlignment = (value?: string): string | null => {
  if (!value) return null;
  switch (value) {
    case 'left':
    case 'center':
    case 'right':
    case 'justify':
    case 'fill':
      return value;
    case 'centerContinuous':
    case 'distributed':
      return 'center';
    case 'general':
      return 'left';
    default:
      return null;
  }
};

const normalizeVerticalAlignment = (value?: string): string | null => {
  if (!value) return null;
  switch (value) {
    case 'top':
    case 'middle':
    case 'bottom':
      return value;
    case 'center':
    case 'distributed':
    case 'justify':
      return 'middle';
    default:
      return null;
  }
};

const getCellBgColor = (cell: ExcelJS.Cell): string | null => {
  const fill = cell.fill;
  if (fill && fill.type === 'pattern' && fill.pattern === 'solid') {
    const fgColor = fill.fgColor;
    if (fgColor) {
      if (fgColor.argb) return argbToHex(fgColor.argb);
      if (fgColor.theme !== undefined) {
        const themeColors: Record<number, string> = {
          0: '#FFFFFF', 1: '#000000', 2: '#E7E6E6', 3: '#44546A',
          4: '#4472C4', 5: '#ED7D31', 6: '#A5A5A5', 7: '#FFC000',
          8: '#5B9BD5', 9: '#70AD47'
        };
        return themeColors[fgColor.theme] || null;
      }
    }
  }
  return null;
};

const getFontColor = (cell: ExcelJS.Cell): string | null => {
  const font = cell.font;
  if (font?.color) {
    if (font.color.argb) return argbToHex(font.color.argb);
    if (font.color.theme !== undefined) {
      const themeColors: Record<number, string> = {
        0: '#FFFFFF', 1: '#000000', 2: '#E7E6E6', 3: '#44546A',
        4: '#4472C4', 5: '#ED7D31', 6: '#A5A5A5', 7: '#FFC000',
        8: '#5B9BD5', 9: '#70AD47'
      };
      return themeColors[font.color.theme] || null;
    }
  }
  return null;
};

const getBorderStyle = (border: Partial<ExcelJS.Border> | undefined): string => {
  if (!border || !border.style) return 'none';
  const color = (border.color?.argb ? argbToHex(border.color.argb) : null) || '#000000';
  switch (border.style) {
    case 'thin': return `1px solid ${color}`;
    case 'medium': return `2px solid ${color}`;
    case 'thick': return `3px solid ${color}`;
    case 'double': return `3px double ${color}`;
    case 'dotted': return `1px dotted ${color}`;
    case 'dashed': return `1px dashed ${color}`;
    default: return `1px solid ${color}`;
  }
};

export async function buildExcelHtmlPreview(inputPath: string, sheetIndex: number): Promise<ExcelHtmlPreview> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inputPath);

  const sheetNames = workbook.worksheets.map(ws => ws.name);
  const resolvedIndex = workbook.worksheets[sheetIndex] ? sheetIndex : 0;
  const worksheet = workbook.worksheets[resolvedIndex];

  if (!worksheet) {
    throw new Error('NO_SHEETS');
  }

  let html = '<table style="border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt;">';

  const mergedCells = new Map<string, { rowSpan: number; colSpan: number }>();
  const skipCells = new Set<string>();

  if ((worksheet as any).model?.merges) {
    for (const merge of (worksheet as any).model.merges) {
      const [start, end] = merge.split(':');
      const startCell = worksheet.getCell(start);
      const endCell = worksheet.getCell(end);

      const startRow = Number(startCell.row);
      const startCol = Number(startCell.col);
      const endRow = Number(endCell.row);
      const endCol = Number(endCell.col);

      mergedCells.set(`${startRow}-${startCol}`, {
        rowSpan: endRow - startRow + 1,
        colSpan: endCol - startCol + 1
      });

      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          if (r !== startRow || c !== startCol) {
            skipCells.add(`${r}-${c}`);
          }
        }
      }
    }
  }

  const colWidths: number[] = [];
  worksheet.columns.forEach((col, index) => {
    colWidths[index] = col.width ? col.width * 7 : 64;
  });

  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const rowHeight = row.height || 15;
    html += `<tr style="height: ${rowHeight}px;">`;

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const cellKey = `${rowNumber}-${colNumber}`;
      if (skipCells.has(cellKey)) return;

      const merge = mergedCells.get(cellKey);
      const rowSpan = merge?.rowSpan || 1;
      const colSpan = merge?.colSpan || 1;

      const styles: string[] = [];
      const bgColor = getCellBgColor(cell);
      if (bgColor) styles.push(`background-color: ${bgColor}`);

      const font = cell.font;
      if (font) {
        if (font.bold) styles.push('font-weight: bold');
        if (font.italic) styles.push('font-style: italic');
        if (font.underline) styles.push('text-decoration: underline');
        if (font.strike) styles.push('text-decoration: line-through');
        if (typeof font.size === 'number') {
          const clampedSize = Math.min(Math.max(font.size, 6), 72);
          styles.push(`font-size: ${clampedSize}pt`);
        }
        if (font.name) {
          const safeFont = sanitizeCssValue(font.name);
          if (safeFont) {
            styles.push(`font-family: ${safeFont}, sans-serif`);
          }
        }
        const fontColor = getFontColor(cell);
        if (fontColor) styles.push(`color: ${fontColor}`);
      }

      const alignment = cell.alignment;
      if (alignment) {
        const horizontal = normalizeHorizontalAlignment(alignment.horizontal as string | undefined);
        if (horizontal) {
          styles.push(`text-align: ${horizontal}`);
        }
        const vertical = normalizeVerticalAlignment(alignment.vertical as string | undefined);
        if (vertical) {
          styles.push(`vertical-align: ${vertical}`);
        }
        if (alignment.wrapText) {
          styles.push('white-space: pre-wrap');
        }
      }

      const border = cell.border;
      if (border) {
        if (border.top) styles.push(`border-top: ${getBorderStyle(border.top)}`);
        if (border.right) styles.push(`border-right: ${getBorderStyle(border.right)}`);
        if (border.bottom) styles.push(`border-bottom: ${getBorderStyle(border.bottom)}`);
        if (border.left) styles.push(`border-left: ${getBorderStyle(border.left)}`);
      }

      const width = colWidths[colNumber - 1];
      if (width) styles.push(`min-width: ${width}px`);
      styles.push('padding: 2px 4px');

      let value = '';
      if (cell.value !== null && cell.value !== undefined) {
        if (typeof cell.value === 'object') {
          if ('richText' in cell.value) {
            value = (cell.value as ExcelJS.CellRichTextValue).richText
              .map(rt => rt.text)
              .join('');
          } else if ('formula' in cell.value) {
            value = String((cell.value as ExcelJS.CellFormulaValue).result || '');
          } else if ('hyperlink' in cell.value) {
            value = String((cell.value as ExcelJS.CellHyperlinkValue).text || '');
          } else if (cell.value instanceof Date) {
            value = cell.value.toLocaleDateString();
          } else {
            value = String(cell.value);
          }
        } else {
          value = String(cell.value);
        }
      }

      value = value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

      const spanAttrs: string[] = [];
      if (rowSpan > 1) spanAttrs.push(`rowspan="${rowSpan}"`);
      if (colSpan > 1) spanAttrs.push(`colspan="${colSpan}"`);

      html += `<td ${spanAttrs.join(' ')} style="${styles.join('; ')}">${value}</td>`;
    });

    html += '</tr>';
  });

  html += '</table>';

  return { html, sheetNames, currentSheet: resolvedIndex };
}
