(function (global) {
    // Setup Dexie database instance once and reuse it everywhere
    const db = new Dexie('DictionaryDB');

    db.version(1).stores({
        words: '++id, word, meaning, createdAt',
        settings: 'key, value'
    });

    global.dictionaryRepository = {
        async getWords() {
            return db.words.orderBy('word').toArray();
        },

        async getAllWords() {
            return db.words.toArray();
        },

        async addWord(word, meaning) {
            return db.words.add({
                word: word.trim(),
                meaning: meaning.trim(),
                createdAt: new Date()
            });
        },

        async deleteWord(id) {
            return db.words.delete(id);
        },

        async processWordData(words, {replaceExisting = false, onlyAddMissing = false} = {}) {
            if (!Array.isArray(words)) {
                throw new Error('Words must be an array.');
            }

            if (replaceExisting) {
                await db.words.clear();
                await db.words.bulkAdd(words);
                return words.length;
            }

            if (onlyAddMissing) {
                const existingWords = await db.words.toArray();
                const existingSet = new Set(
                    existingWords
                        .map(word => word.word?.trim().toLowerCase())
                        .filter(Boolean)
                );

                const sanitizedWords = words
                    .map(word => ({
                        word: word.word?.trim(),
                        meaning: word.meaning?.trim() || '',
                        createdAt: word.createdAt ? new Date(word.createdAt) : new Date()
                    }))
                    .filter(word => word.word && !existingSet.has(word.word.toLowerCase()));

                if (sanitizedWords.length === 0) {
                    return 0;
                }

                await db.words.bulkAdd(sanitizedWords);
                return sanitizedWords.length;
            }

            await db.words.bulkAdd(words);
            return words.length;
        }
    };
})(window);
