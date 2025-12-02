// Register service worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
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
        testMode: 'multiple-choice',
        currentPrompt: null,
        questionAnswered: false,
        selectedOptionId: null,
        writtenAnswer: '',
        answerFeedback: '',
        similarityScore: null,
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
                this.words = await dictionaryRepository.getWords();
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

        async addWord() {
            if (!this.newWord.word || !this.newWord.meaning) return;

            try {
                await dictionaryRepository.addWord(this.newWord.word, this.newWord.meaning);

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
                await dictionaryRepository.deleteWord(id);
                await this.loadWords();
            } catch (error) {
                console.error('Error deleting word:', error);
            }
        },

        async startTest(mode = null) {
            if (mode) {
                this.testMode = mode;
            }

            if (this.words.length === 0) {
                alert('Add words to your dictionary before starting a test.');
                return;
            }

            const shuffledWords = [...this.words].sort(() => 0.5 - Math.random());
            const questionsCount = Math.min(this.questionLimit, shuffledWords.length);
            this.testWords = shuffledWords.slice(0, questionsCount);
            this.totalQuestions = questionsCount;
            this.score = 0;
            this.testComplete = false;
            this.loadNextPrompt();
        },

        loadNextPrompt() {
            if (this.testWords.length === 0) {
                this.testComplete = true;
                this.currentPrompt = null;
                return;
            }

            this.resetQuestionState();

            const nextWord = this.testWords.pop();
            const promptType = this.resolveQuestionType();
            this.currentPrompt = this.createPrompt(nextWord, promptType);
            this.correctAnswer = this.currentPrompt?.correctResponse || '';
        },

        resolveQuestionType() {
            if (this.testMode === 'mixed') {
                return Math.random() < 0.5 ? 'multiple-choice' : 'written';
            }
            return this.testMode;
        },

        createPrompt(word, type) {
            if (type === 'written') {
                return this.createWrittenPrompt(word);
            }
            return this.createMultipleChoicePrompt(word);
        },

        createMultipleChoicePrompt(correctWord) {
            const incorrectWords = this.words
                .filter(w => w.id !== correctWord.id)
                .sort(() => 0.5 - Math.random())
                .slice(0, 3);

            const options = [
                { id: `correct-${correctWord.id}`, label: correctWord.meaning, isCorrect: true }
            ].concat(
                incorrectWords.map((w, index) => ({
                    id: `incorrect-${correctWord.id}-${index}`,
                    label: w.meaning,
                    isCorrect: false
                }))
            ).sort(() => 0.5 - Math.random());

            return {
                type: 'multiple-choice',
                description: 'What is the meaning of:',
                question: correctWord.word,
                options,
                correctResponse: correctWord.meaning
            };
        },

        createWrittenPrompt(word) {
            return {
                type: 'written',
                description: 'Type the word for this meaning:',
                prompt: word.meaning,
                correctResponse: word.word,
                normalizedCorrect: this.normalizeText(word.word)
            };
        },

        resetQuestionState() {
            this.questionAnswered = false;
            this.selectedOptionId = null;
            this.writtenAnswer = '';
            this.answerFeedback = '';
            this.similarityScore = null;
            this.isCorrect = false;
        },

        selectOption(option) {
            if (!this.currentPrompt || this.currentPrompt.type !== 'multiple-choice' || this.questionAnswered) {
                return;
            }

            this.selectedOptionId = option.id;
            this.questionAnswered = true;
            this.isCorrect = !!option.isCorrect;

            if (this.isCorrect) {
                this.score++;
                this.answerFeedback = 'Great job!';
            } else {
                this.answerFeedback = 'Not quite. Keep practicing!';
            }
        },

        submitWrittenAnswer() {
            if (!this.currentPrompt || this.currentPrompt.type !== 'written' || this.questionAnswered) {
                return;
            }

            const normalizedInput = this.normalizeText(this.writtenAnswer);
            if (!normalizedInput) {
                return;
            }

            const similarity = this.calculateSimilarity(
                normalizedInput,
                this.currentPrompt.normalizedCorrect
            );

            this.similarityScore = Math.round(similarity * 100);
            this.isCorrect = similarity >= 0.95;
            this.questionAnswered = true;

            if (this.isCorrect) {
                this.score++;
                this.answerFeedback = 'Perfect!';
            } else if (similarity >= 0.8) {
                this.answerFeedback = 'Close! Double-check the spelling.';
            } else {
                this.answerFeedback = 'Keep practicing that spelling.';
            }
        },

        setTestMode(mode) {
            if (this.testMode === mode) {
                return;
            }
            this.testMode = mode;
            this.startTest(mode);
        },

        async exportData() {
            try {
                const words = await dictionaryRepository.getAllWords();
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

                const addedCount = await dictionaryRepository.processWordData(words, { onlyAddMissing: true });
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

                    const importedCount = await dictionaryRepository.processWordData(data.words, { replaceExisting: true });
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

        normalizeText(text) {
            if (!text) return '';
            return text
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        },

        calculateSimilarity(a, b) {
            if (!a && !b) return 1;
            if (!a || !b) return 0;
            const distance = this.levenshteinDistance(a, b);
            const maxLen = Math.max(a.length, b.length) || 1;
            return 1 - distance / maxLen;
        },

        levenshteinDistance(a, b) {
            if (a === b) return 0;
            const matrix = Array.from({ length: a.length + 1 }, () =>
                new Array(b.length + 1).fill(0)
            );

            for (let i = 0; i <= a.length; i++) {
                matrix[i][0] = i;
            }
            for (let j = 0; j <= b.length; j++) {
                matrix[0][j] = j;
            }

            for (let i = 1; i <= a.length; i++) {
                for (let j = 1; j <= b.length; j++) {
                    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j - 1] + cost
                    );
                }
            }

            return matrix[a.length][b.length];
        }
    }));
});
