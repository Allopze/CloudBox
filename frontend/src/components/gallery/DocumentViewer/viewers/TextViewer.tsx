interface TextViewerProps {
    content: string;
    pageWidth: number;
}

export default function TextViewer({ content, pageWidth }: TextViewerProps) {
    return (
        <div
            className="bg-white dark:bg-dark-800 shadow-lg rounded-lg p-8 mx-4"
            style={{ width: `${pageWidth}px`, maxWidth: '95vw', minHeight: '60vh' }}
        >
            <pre className="whitespace-pre-wrap break-words max-w-full font-mono text-sm text-gray-800 dark:text-gray-200 overflow-x-hidden">
                {content}
            </pre>
        </div>
    );
}
