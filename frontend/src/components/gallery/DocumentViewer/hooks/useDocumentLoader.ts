/**
 * Document type utilities for DocumentViewer
 */

export type DocumentType = 'pdf' | 'text' | 'spreadsheet' | 'office' | 'unknown';

/**
 * Helper to determine document type from mime type and filename
 */
export function getDocumentType(mimeType: string, fileName: string): DocumentType {
    const lowerName = fileName.toLowerCase();
    if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
        return 'pdf';
    }
    if (mimeType.startsWith('text/') || lowerName.endsWith('.txt') || lowerName.endsWith('.md') ||
        lowerName.endsWith('.json') || lowerName.endsWith('.xml') || lowerName.endsWith('.csv')) {
        return 'text';
    }
    const isXlsx = mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        lowerName.endsWith('.xlsx');
    if (isXlsx) {
        return 'spreadsheet';
    }
    if (mimeType.includes('word') || mimeType.includes('excel') || mimeType.includes('powerpoint') ||
        mimeType.includes('spreadsheet') || mimeType.includes('presentation') ||
        lowerName.endsWith('.doc') || lowerName.endsWith('.docx') ||
        lowerName.endsWith('.xls') ||
        lowerName.endsWith('.ppt') || lowerName.endsWith('.pptx')) {
        return 'office';
    }
    return 'unknown';
}
