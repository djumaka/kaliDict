// Initialize the database
const db = new Dexie('DictionaryDB');

db.version(1).stores({
    words: '++id, word, meaning, createdAt',
    settings: 'key, value'
});

// Register service worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// Main app
document.addEventListener('alpine:init', () => {
    Alpine.data('dictionaryApp', () => ({
        // Set the default view to 'random'
        view: 'random',
        words: [],
        filteredWords: [],
        searchTerm: '',
        addNewWord: false,
        newWord: {
            word: '',
            meaning: ''
        },
        testWords: [],
        currentTest: {
            question: '',
            options: []
        },
        selectedAnswer: null,
        isCorrect: false,
        correctAnswer: '',
        score: 0,
        questionLimit: 10,
        totalQuestions: 10,
        testComplete: false,
        loading: false,
        randomWord: null,
        isAdminMode: false,

        toggleAdminMode() {
            if (!this.isAdminMode) {
                if (confirm('Are you sure you want to enable admin mode? This will show advanced options.')) {
                    this.isAdminMode = true;
                }
            } else {
                this.isAdminMode = false;
            }
        },

        async init() {
            await this.loadWords();
            if (this.view === 'random') {
                await this.showRandomWord();
            }
        },

        async showRandomWord() {
            if (this.words.length === 0) {
                this.randomWord = null;
                return;
            }

            this.loading = true;

            try {
                // Small delay to show loading state
                await new Promise(resolve => setTimeout(resolve, 200));

                // Get a random word that's different from the current one
                let newRandomWord;
                do {
                    const randomIndex = Math.floor(Math.random() * this.words.length);
                    newRandomWord = this.words[randomIndex];
                } while (this.words.length > 1 && newRandomWord?.id === this.randomWord?.id);

                this.randomWord = newRandomWord;
            } finally {
                this.loading = false;
            }
        },

        async loadWords() {
            try {
                this.words = await db.words.orderBy('word').toArray();
                this.filteredWords = [...this.words];
            } catch (error) {
                console.error('Error loading words:', error);
            }
        },

        filterWords() {
            if (!this.searchTerm) {
                this.filteredWords = [...this.words];
                return;
            }

            const term = this.searchTerm.toLowerCase();
            this.filteredWords = this.words.filter(word =>
                word.word.toLowerCase().includes(term) ||
                word.meaning.toLowerCase().includes(term)
            );
        },

        get wordCards() {
            return this.filteredWords.map(word => `
                <div class="card">
                    <h3>${this.escapeHtml(word.word)}</h3>
                    <p>${this.escapeHtml(word.meaning)}</p>
                    ${this.isAdminMode ? `
                    <button @click="deleteWord(${word.id})" class="secondary" style="margin-top: 0.5rem; color: white; background-color: #dc2626; border-color: #dc2626; padding: 0.25rem 0.5rem; display: inline-flex; align-items: center; justify-content: center; width: auto; min-width: 32px;" title="Delete">
                        <iconify-icon icon="jam:trash" width="16" height="16"></iconify-icon>
                    </button>
                    ` : ''}
                </div>
            `).join('');
        },

        escapeHtml(unsafe) {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        },

        async addWord() {
            if (!this.newWord.word || !this.newWord.meaning) return;

            try {
                await db.words.add({
                    word: this.newWord.word.trim(),
                    meaning: this.newWord.meaning.trim(),
                    createdAt: new Date()
                });

                this.newWord = { word: '', meaning: '' };
                this.addNewWord = false;
                await this.loadWords();
            } catch (error) {
                console.error('Error adding word:', error);
            }
        },

        async deleteWord(id) {
            if (!confirm('Are you sure you want to delete this word?')) return;

            try {
                await db.words.delete(id);
                await this.loadWords();
            } catch (error) {
                console.error('Error deleting word:', error);
            }
        },

        async startTest() {
            const shuffledWords = [...this.words].sort(() => 0.5 - Math.random());
            const questionsCount = Math.min(this.questionLimit, shuffledWords.length);
            this.testWords = shuffledWords.slice(0, questionsCount);
            this.totalQuestions = questionsCount;
            this.score = 0;
            this.testComplete = false;
            this.nextQuestion();
        },

        nextQuestion() {
            if (this.testWords.length === 0) {
                this.testComplete = true;
                return;
            }

            this.selectedAnswer = null;
            this.isCorrect = false;

            // Use the next preselected word
            const correctWord = this.testWords.pop();

            // Get 3 random incorrect answers
            const incorrectWords = this.words
                .filter(w => w.id !== correctWord.id)
                .sort(() => 0.5 - Math.random())
                .slice(0, 3);

            // Combine and shuffle options
            const options = [
                { text: correctWord.meaning, correct: true }
            ].concat(
                incorrectWords.map(w => ({ text: w.meaning, correct: false }))
            ).sort(() => 0.5 - Math.random());

            this.currentTest = {
                question: correctWord.word,
                options: options,
                correctMeaning: correctWord.meaning
            };

            this.correctAnswer = correctWord.meaning;
        },

        checkAnswer(isCorrect, event) {
            if (this.selectedAnswer !== null) return;

            this.selectedAnswer = event.target.textContent;
            this.isCorrect = isCorrect;

            if (isCorrect) {
                this.score++;
            }
        },

        async exportData() {
            try {
                const words = await db.words.toArray();
                const data = {
                    version: 1,
                    exportedAt: new Date().toISOString(),
                    words: words
                };

                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = `dictionary-export-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Error exporting data:', error);
                alert('Failed to export data. Please try again.');
            }
        },

        importData() {
            document.getElementById('importFile').click();
        },

        async syncWords() {
            try {
                const dictUrl = new URL('./dict.json', window.location.href);
                const response = await fetch(dictUrl, { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error('Failed to fetch dictionary.');
                }

                const payload = await response.json();
                const words = Array.isArray(payload?.words) ? payload.words : Array.isArray(payload) ? payload : null;

                if (!words) {
                    throw new Error('Invalid dictionary format.');
                }

                const addedCount = await this.processWordData(words, { onlyAddMissing: true });
                await this.loadWords();

                if (addedCount === 0) {
                    alert('Your dictionary is already up to date.');
                } else {
                    alert(`Added ${addedCount} new ${addedCount === 1 ? 'word' : 'words'}.`);
                }
            } catch (error) {
                console.error('Error syncing words:', error);
                alert('Failed to sync words. Please try again later.');
            }
        },

        async handleFileImport(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);

                    if (!data.words || !Array.isArray(data.words)) {
                        throw new Error('Invalid file format');
                    }

                    const importedCount = await this.processWordData(data.words, { replaceExisting: true });
                    await this.loadWords();

                    alert(`Successfully imported ${importedCount} words.`);
                } catch (error) {
                    console.error('Error importing data:', error);
                    alert('Failed to import data. The file may be corrupted or in an incorrect format.');
                }
            };
            reader.readAsText(file);

            // Reset the input so the same file can be imported again if needed
            event.target.value = '';
        },

        async processWordData(words, { replaceExisting = false, onlyAddMissing = false } = {}) {
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
    }));
});
