import sharp from 'sharp';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { getThumbnailPath, fileExists, getStoragePath } from './storage.js';
import * as mm from 'music-metadata';
import ExcelJS from 'exceljs';
import ffmpegPath from 'ffmpeg-static';

const execAsync = promisify(exec);

const THUMBNAIL_SIZE = 300;

export const generateImageThumbnail = async (inputPath: string, fileId: string): Promise<string | null> => {
  try {
    const outputPath = getThumbnailPath(fileId);

    await sharp(inputPath)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality: 80 })
      .toFile(outputPath);

    return outputPath;
  } catch (error) {
    console.error('Error generating image thumbnail:', error);
    return null;
  }
};

// Issue #7: FFmpeg execution options with resource limits
const FFMPEG_OPTIONS = {
  timeout: 30000, // 30 seconds max
  maxBuffer: 50 * 1024 * 1024, // 50MB max buffer
};

export const generateVideoThumbnail = async (inputPath: string, fileId: string): Promise<string | null> => {
  const outputPath = getThumbnailPath(fileId);
  const tempPath = outputPath.replace('.webp', '_temp.jpg');

  if (!ffmpegPath) {
    console.error('ffmpeg-static binary not found');
    return null;
  }

  try {
    // Extract frame at 1 second using ffmpeg with timeout and buffer limits
    await execAsync(
      `"${ffmpegPath}" -i "${inputPath}" -ss 00:00:01 -vframes 1 -y "${tempPath}"`,
      FFMPEG_OPTIONS
    );

    // Convert to webp thumbnail
    await sharp(tempPath)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality: 80 })
      .toFile(outputPath);

    await fs.unlink(tempPath).catch(() => { });

    return outputPath;
  } catch (error) {
    console.error('Error generating video thumbnail:', error);
    // Clean up temp file on error
    await fs.unlink(tempPath).catch(() => { });
    return null;
  }
};

export const generateAudioCover = async (inputPath: string, fileId: string): Promise<string | null> => {
  try {
    const outputPath = getThumbnailPath(fileId);

    // Try to extract cover art using music-metadata
    const metadata = await mm.parseFile(inputPath);
    const picture = metadata.common.picture?.[0];

    if (picture && picture.data) {
      // Convert embedded cover art to thumbnail
      const buffer = Buffer.from(picture.data);
      await sharp(buffer)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
          fit: 'cover',
          position: 'center',
        })
        .webp({ quality: 80 })
        .toFile(outputPath);

      return outputPath;
    }

    // Fallback: try with ffmpeg
    const tempPath = outputPath.replace('.webp', '_temp.jpg');
    if (ffmpegPath) {
      try {
        await execAsync(
          `"${ffmpegPath}" -i "${inputPath}" -an -vcodec copy -y "${tempPath}"`,
          FFMPEG_OPTIONS
        );

        if (await fileExists(tempPath)) {
          await sharp(tempPath)
            .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
              fit: 'cover',
              position: 'center',
            })
            .webp({ quality: 80 })
            .toFile(outputPath);

          await fs.unlink(tempPath).catch(() => { });
          return outputPath;
        }
      } catch {
        // ffmpeg fallback failed, that's ok
        await fs.unlink(tempPath).catch(() => { });
      }
    }

    return null;
  } catch (error) {
    // Audio might not have cover art
    console.error('Error extracting audio cover:', error);
    return null;
  }
};

export const generatePdfThumbnail = async (inputPath: string, fileId: string): Promise<string | null> => {
  try {
    const outputPath = getThumbnailPath(fileId);
    const tempPath = getStoragePath('temp', `${fileId}_pdf.png`);

    // Use pdftoppm (from poppler-utils) or ImageMagick to convert first page
    // Try pdftoppm first (better quality)
    try {
      await execAsync(
        `pdftoppm -png -f 1 -l 1 -scale-to ${THUMBNAIL_SIZE * 2} "${inputPath}" "${tempPath.replace('.png', '')}"`
      );

      // pdftoppm adds -1 suffix
      const pdfTempPath = tempPath.replace('.png', '-1.png');
      if (await fileExists(pdfTempPath)) {
        await sharp(pdfTempPath)
          .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
            fit: 'cover',
            position: 'north', // Focus on top of document
          })
          .webp({ quality: 80 })
          .toFile(outputPath);

        await fs.unlink(pdfTempPath).catch(() => { });
        return outputPath;
      }
    } catch {
      // pdftoppm not available, try ImageMagick
    }

    // Fallback to ImageMagick/GraphicsMagick
    try {
      await execAsync(
        `magick convert -density 150 "${inputPath}[0]" -resize ${THUMBNAIL_SIZE * 2}x${THUMBNAIL_SIZE * 2} "${tempPath}"`
      );

      if (await fileExists(tempPath)) {
        await sharp(tempPath)
          .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
            fit: 'cover',
            position: 'north',
          })
          .webp({ quality: 80 })
          .toFile(outputPath);

        await fs.unlink(tempPath).catch(() => { });
        return outputPath;
      }
    } catch {
      // ImageMagick not available
    }

    // Try with convert command (older ImageMagick)
    try {
      await execAsync(
        `convert -density 150 "${inputPath}[0]" -resize ${THUMBNAIL_SIZE * 2}x${THUMBNAIL_SIZE * 2} "${tempPath}"`
      );

      if (await fileExists(tempPath)) {
        await sharp(tempPath)
          .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
            fit: 'cover',
            position: 'north',
          })
          .webp({ quality: 80 })
          .toFile(outputPath);

        await fs.unlink(tempPath).catch(() => { });
        return outputPath;
      }
    } catch {
      // convert not available
    }

    // Fallback to GraphicsMagick (gm) - installed in Docker Alpine
    try {
      await execAsync(
        `gm convert -density 150 "${inputPath}[0]" -resize ${THUMBNAIL_SIZE * 2}x${THUMBNAIL_SIZE * 2} "${tempPath}"`
      );

      if (await fileExists(tempPath)) {
        await sharp(tempPath)
          .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
            fit: 'cover',
            position: 'north',
          })
          .webp({ quality: 80 })
          .toFile(outputPath);

        await fs.unlink(tempPath).catch(() => { });
        return outputPath;
      }
    } catch {
      // GraphicsMagick not available either
    }

    return null;
  } catch (error) {
    console.error('Error generating PDF thumbnail:', error);
    return null;
  }
};

export const generateSpreadsheetThumbnail = async (inputPath: string, fileId: string): Promise<string | null> => {
  try {
    const outputPath = getThumbnailPath(fileId);

    // Use ExcelJS to read the spreadsheet and render it as an HTML table, then convert to image
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputPath);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return generateExcelThumbnail(fileId);
    }

    // Build SVG representation of the spreadsheet (first ~8 rows, ~5 columns)
    const maxRows = 8;
    const maxCols = 5;
    const cellWidth = 55;
    const cellHeight = 24;
    const headerHeight = 28;
    const padding = 10;

    const svgWidth = THUMBNAIL_SIZE;
    const svgHeight = THUMBNAIL_SIZE;
    const tableWidth = maxCols * cellWidth;
    const tableHeight = headerHeight + (maxRows * cellHeight);
    const startX = (svgWidth - tableWidth) / 2;
    const startY = (svgHeight - tableHeight) / 2;

    let svgContent = `
      <svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${svgWidth}" height="${svgHeight}" fill="#fff"/>
        
        <!-- Excel Green Header Bar -->
        <rect x="0" y="0" width="${svgWidth}" height="8" fill="#107C41"/>
        
        <!-- Column Headers Background -->
        <rect x="${startX}" y="${startY}" width="${tableWidth}" height="${headerHeight}" fill="#f3f4f6" stroke="#e5e7eb" stroke-width="1"/>
        
        <!-- Row Headers Background (Left vertical) -->
        <rect x="${startX}" y="${startY + headerHeight}" width="${cellWidth}" height="${maxRows * cellHeight}" fill="#f3f4f6" stroke="#e5e7eb" stroke-width="1"/>
    `;

    // Draw column headers (A, B, C...)
    for (let col = 1; col < maxCols; col++) {
      const x = startX + col * cellWidth + cellWidth / 2;
      const y = startY + headerHeight / 2 + 4;
      const letter = String.fromCharCode(64 + col);
      svgContent += `<text x="${x}" y="${y}" text-anchor="middle" fill="#6b7280" font-family="Arial, sans-serif" font-size="10" font-weight="600">${letter}</text>`;

      // Vertical grid lines
      svgContent += `<line x1="${startX + col * cellWidth}" y1="${startY}" x2="${startX + col * cellWidth}" y2="${startY + tableHeight}" stroke="#e5e7eb" stroke-width="1"/>`;
    }

    // Draw cells with actual data
    let rowIndex = 0;
    worksheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowIndex >= maxRows) return;

      const y = startY + headerHeight + rowIndex * cellHeight;
      const textY = y + cellHeight / 2 + 4;

      // Row number
      const rowNumX = startX + cellWidth / 2;
      svgContent += `<text x="${rowNumX}" y="${textY}" text-anchor="middle" fill="#6b7280" font-family="Arial, sans-serif" font-size="10" font-weight="600">${rowNum}</text>`;

      // Horizontal grid line
      if (rowIndex > 0) {
        svgContent += `<line x1="${startX}" y1="${y}" x2="${startX + tableWidth}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
      }

      // Draw cell values
      for (let col = 1; col < maxCols; col++) {
        const cell = row.getCell(col + 1); // Start from column B (index 2) as A is row numbers in our visual
        let value = '';

        if (cell.value !== null && cell.value !== undefined) {
          if (typeof cell.value === 'object') {
            if ('richText' in cell.value) {
              value = (cell.value as ExcelJS.CellRichTextValue).richText.map(rt => rt.text).join('').trim();
            } else if ('result' in (cell.value as any)) {
              value = String((cell.value as any).result || '').trim();
            } else if (cell.value instanceof Date) {
              value = cell.value.toLocaleDateString();
            } else {
              value = String(cell.value).trim();
            }
          } else {
            value = String(cell.value).trim();
          }
        }

        if (value) {
          // Truncate long values
          if (value.length > 8) {
            value = value.substring(0, 7) + '…';
          }
          // Escape XML
          value = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

          const x = startX + col * cellWidth + 6;

          // Text color based on content (simple heuristic)
          const textColor = isNaN(Number(value)) ? '#374151' : '#2563eb'; // Blue for numbers

          svgContent += `<text x="${x}" y="${textY}" fill="${textColor}" font-family="Arial, sans-serif" font-size="9">${value}</text>`;
        }
      }

      rowIndex++;
    });

    // Fill empty rows grid
    for (let r = rowIndex; r < maxRows; r++) {
      const y = startY + headerHeight + r * cellHeight;
      const textY = y + cellHeight / 2 + 4;
      const rowNumX = startX + cellWidth / 2;
      svgContent += `<text x="${rowNumX}" y="${textY}" text-anchor="middle" fill="#6b7280" font-family="Arial, sans-serif" font-size="10" font-weight="600">${r + 1}</text>`;
      svgContent += `<line x1="${startX}" y1="${y}" x2="${startX + tableWidth}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
    }

    // Outer border
    svgContent += `<rect x="${startX}" y="${startY}" width="${tableWidth}" height="${tableHeight}" fill="none" stroke="#d1d5db" stroke-width="1"/>`;

    svgContent += '</svg>';

    // Convert SVG to WebP thumbnail
    await sharp(Buffer.from(svgContent))
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE)
      .webp({ quality: 85 })
      .toFile(outputPath);

    return outputPath;
  } catch (error) {
    console.error('Error generating spreadsheet thumbnail:', error);
    // Fallback to static Excel icon
    return generateExcelThumbnail(fileId);
  }
};

export const generateExcelThumbnail = async (fileId: string): Promise<string | null> => {
  const outputPath = getThumbnailPath(fileId);

  try {
    // Create Excel-specific thumbnail with muted colors
    const svgIcon = `
      <svg width="${THUMBNAIL_SIZE}" height="${THUMBNAIL_SIZE}" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
        <rect width="300" height="300" fill="#f5f5f4"/>
        <rect x="50" y="40" width="200" height="220" rx="8" fill="white" stroke="#78716c" stroke-width="3"/>
        <!-- Table header -->
        <rect x="50" y="40" width="200" height="35" rx="8" fill="#78716c"/>
        <rect x="50" y="67" width="200" height="8" fill="#78716c"/>
        <!-- Grid lines vertical -->
        <line x1="116" y1="75" x2="116" y2="260" stroke="#d6d3d1" stroke-width="1"/>
        <line x1="183" y1="75" x2="183" y2="260" stroke="#d6d3d1" stroke-width="1"/>
        <!-- Grid lines horizontal -->
        <line x1="50" y1="115" x2="250" y2="115" stroke="#d6d3d1" stroke-width="1"/>
        <line x1="50" y1="155" x2="250" y2="155" stroke="#d6d3d1" stroke-width="1"/>
        <line x1="50" y1="195" x2="250" y2="195" stroke="#d6d3d1" stroke-width="1"/>
        <line x1="50" y1="235" x2="250" y2="235" stroke="#d6d3d1" stroke-width="1"/>
        <!-- Sample data cells -->
        <rect x="58" y="85" width="50" height="20" rx="2" fill="#e7e5e4"/>
        <rect x="124" y="85" width="50" height="20" rx="2" fill="#f5f5f4"/>
        <rect x="191" y="85" width="50" height="20" rx="2" fill="#f5f5f4"/>
        <rect x="58" y="125" width="50" height="20" rx="2" fill="#e7e5e4"/>
        <rect x="124" y="125" width="50" height="20" rx="2" fill="#f5f5f4"/>
        <rect x="191" y="125" width="50" height="20" rx="2" fill="#f5f5f4"/>
        <rect x="58" y="165" width="50" height="20" rx="2" fill="#e7e5e4"/>
        <rect x="124" y="165" width="50" height="20" rx="2" fill="#f5f5f4"/>
        <rect x="191" y="165" width="50" height="20" rx="2" fill="#f5f5f4"/>
        <rect x="58" y="205" width="50" height="20" rx="2" fill="#e7e5e4"/>
        <rect x="124" y="205" width="50" height="20" rx="2" fill="#f5f5f4"/>
        <rect x="191" y="205" width="50" height="20" rx="2" fill="#f5f5f4"/>
      </svg>
    `;

    await sharp(Buffer.from(svgIcon))
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE)
      .webp({ quality: 80 })
      .toFile(outputPath);

    return outputPath;
  } catch (error) {
    console.error('Error generating Excel thumbnail:', error);
    return null;
  }
};

export const generateDocumentThumbnail = async (inputPath: string, fileId: string, mimeType: string): Promise<string | null> => {
  // For now, we'll create a simple placeholder thumbnail for documents
  // In production, you might want to use LibreOffice headless or similar
  const outputPath = getThumbnailPath(fileId);

  try {
    // Create a simple document icon thumbnail using sharp
    // This is a placeholder - you can enhance this with actual document conversion
    const svgIcon = `
      <svg width="${THUMBNAIL_SIZE}" height="${THUMBNAIL_SIZE}" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
        <rect width="300" height="300" fill="#f3f4f6"/>
        <rect x="60" y="30" width="180" height="240" rx="8" fill="white" stroke="#d1d5db" stroke-width="2"/>
        <rect x="80" y="80" width="140" height="12" rx="2" fill="#9ca3af"/>
        <rect x="80" y="110" width="120" height="12" rx="2" fill="#d1d5db"/>
        <rect x="80" y="140" width="140" height="12" rx="2" fill="#d1d5db"/>
        <rect x="80" y="170" width="100" height="12" rx="2" fill="#d1d5db"/>
        <rect x="80" y="200" width="130" height="12" rx="2" fill="#d1d5db"/>
      </svg>
    `;

    await sharp(Buffer.from(svgIcon))
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE)
      .webp({ quality: 80 })
      .toFile(outputPath);

    return outputPath;
  } catch (error) {
    console.error('Error generating document thumbnail:', error);
    return null;
  }
};

export const generateThumbnail = async (
  inputPath: string,
  fileId: string,
  mimeType: string
): Promise<string | null> => {
  if (mimeType.startsWith('image/')) {
    return generateImageThumbnail(inputPath, fileId);
  }

  if (mimeType.startsWith('video/')) {
    return generateVideoThumbnail(inputPath, fileId);
  }

  if (mimeType.startsWith('audio/')) {
    return generateAudioCover(inputPath, fileId);
  }

  if (mimeType === 'application/pdf') {
    return generatePdfThumbnail(inputPath, fileId);
  }

  // Office documents
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mimeType === 'application/vnd.ms-powerpoint'
  ) {
    // If it's a spreadsheet, try to generate a real preview
    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || mimeType === 'application/vnd.ms-excel') {
      return generateSpreadsheetThumbnail(inputPath, fileId);
    }
    return generateDocumentThumbnail(inputPath, fileId, mimeType);
  }

  return null;
};

export const processAvatar = async (inputPath: string, outputPath: string): Promise<void> => {
  await sharp(inputPath)
    .resize(256, 256, {
      fit: 'cover',
      position: 'center',
    })
    .webp({ quality: 90 })
    .toFile(outputPath);
};
