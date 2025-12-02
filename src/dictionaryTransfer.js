(function (global) {
    function parseDictionaryWords(payload) {
        const words = Array.isArray(payload?.words)
            ? payload.words
            : Array.isArray(payload)
                ? payload
                : null;

        if (!words) {
            throw new Error('Invalid dictionary format.');
        }

        return words;
    }

    function buildExportData(words) {
        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            words: words
        };
    }

    function downloadJsonFile(data, filenamePrefix = 'dictionary-export') {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${filenamePrefix}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = () => reject(new Error('Failed to read file.'));
            reader.readAsText(file);
        });
    }

    global.dictionaryTransfer = {
        parseDictionaryWords,
        buildExportData,
        downloadJsonFile,
        readFileAsText
    };
})(window);
