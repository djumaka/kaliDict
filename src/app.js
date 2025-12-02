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
        testSession: null,
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

        applyTestSession(session) {
            this.testSession = session;

            if (!session) {
                this.currentPrompt = null;
                this.correctAnswer = '';
                this.questionAnswered = false;
                this.selectedOptionId = null;
                this.similarityScore = null;
                this.isCorrect = false;
                this.answerFeedback = '';
                this.score = 0;
                this.totalQuestions = this.questionLimit;
                this.testComplete = false;
                return;
            }

            this.currentPrompt = session.currentPrompt;
            this.correctAnswer = session.correctAnswer;
            this.questionAnswered = session.questionAnswered;
            this.selectedOptionId = session.selectedOptionId;
            this.similarityScore = session.similarityScore;
            this.isCorrect = session.isCorrect;
            this.answerFeedback = session.answerFeedback;
            this.score = session.score;
            this.totalQuestions = session.totalQuestions;
            this.testComplete = session.testComplete;
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

            const session = testEngine.startSession({
                words: this.words,
                questionLimit: this.questionLimit,
                mode: this.testMode
            });

            this.writtenAnswer = '';
            this.applyTestSession(session);
        },

        loadNextPrompt() {
            if (!this.testSession) {
                return;
            }

            const session = testEngine.loadNextPrompt(this.testSession);
            this.writtenAnswer = '';
            this.applyTestSession(session);
        },

        selectOption(option) {
            if (!this.testSession) {
                return;
            }

            const session = testEngine.answerMultipleChoice(this.testSession, option);
            this.applyTestSession(session);
        },

        submitWrittenAnswer() {
            if (!this.testSession) {
                return;
            }

            const session = testEngine.answerWritten(this.testSession, this.writtenAnswer);
            this.applyTestSession(session);
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
                const data = dictionaryTransfer.buildExportData(words);
                dictionaryTransfer.downloadJsonFile(data);
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
                const words = dictionaryTransfer.parseDictionaryWords(payload);

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

            try {
                const fileContent = await dictionaryTransfer.readFileAsText(file);
                const payload = JSON.parse(fileContent);
                const words = dictionaryTransfer.parseDictionaryWords(payload);

                const importedCount = await dictionaryRepository.processWordData(words, { replaceExisting: true });
                await this.loadWords();

                alert(`Successfully imported ${importedCount} words.`);
            } catch (error) {
                console.error('Error importing data:', error);
                alert('Failed to import data. The file may be corrupted or in an incorrect format.');
            } finally {
                // Reset the input so the same file can be imported again if needed
                event.target.value = '';
            }
        },

    }));
});
