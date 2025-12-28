(function (global) {
    function shuffle(array) {
        const copy = array.slice();
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    function resolveQuestionType(mode) {
        if (mode === 'mixed') {
            return Math.random() < 0.5 ? 'multiple-choice' : 'written';
        }
        return mode;
    }

    function createPrompt(word, type, wordBank) {
        if (type === 'written') {
            return createWrittenPrompt(word);
        }
        return createMultipleChoicePrompt(word, wordBank);
    }

    function createMultipleChoicePrompt(correctWord, wordBank) {
        const incorrectWords = wordBank
            .filter(w => w.id !== correctWord.id)
            .sort(() => 0.5 - Math.random())
            .slice(0, 3);

        const options = [
            { id: `correct-${correctWord.id}`, label: correctWord.meaning, isCorrect: true },
            ...incorrectWords.map((w, index) => ({
                id: `incorrect-${correctWord.id}-${index}`,
                label: w.meaning,
                isCorrect: false
            }))
        ].sort(() => 0.5 - Math.random());

        return {
            type: 'multiple-choice',
            description: 'What is the meaning of:',
            question: correctWord.word,
            options,
            correctResponse: correctWord.meaning,
            sourceWord: correctWord
        };
    }

    function createWrittenPrompt(word) {
        return {
            type: 'written',
            description: 'Type the word for this meaning:',
            prompt: word.meaning,
            correctResponse: word.word,
            normalizedCorrect: normalizeText(word.word),
            sourceWord: word
        };
    }

    function normalizeText(text) {
        if (!text) return '';
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[.?!]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function calculateSimilarity(a, b) {
        if (!a && !b) return 1;
        if (!a || !b) return 0;
        const distance = levenshteinDistance(a, b);
        const maxLen = Math.max(a.length, b.length) || 1;
        return 1 - distance / maxLen;
    }

    function levenshteinDistance(a, b) {
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

    function createSession({ words = [], questionLimit = 10, mode = 'multiple-choice' } = {}) {
        const totalQuestions = Math.min(questionLimit, words.length);
        const remainingWords = shuffle(words).slice(0, totalQuestions);
        const session = {
            mode,
            wordBank: words.slice(),
            remainingWords,
            totalQuestions,
            phase: 'initial',
            missedWords: [],
            reviewTotal: 0,
            score: 0,
            currentPrompt: null,
            correctAnswer: '',
            questionAnswered: false,
            selectedOptionId: null,
            similarityScore: null,
            isCorrect: false,
            answerFeedback: '',
            testComplete: totalQuestions === 0
        };

        return loadNextPrompt(session);
    }

    function resetQuestionState(session) {
        return {
            ...session,
            questionAnswered: false,
            selectedOptionId: null,
            similarityScore: null,
            isCorrect: false,
            answerFeedback: ''
        };
    }

    function addMissedWord(session, word) {
        if (!word || !session || session.phase !== 'initial') {
            return session;
        }

        const alreadyMissed = session.missedWords.some(item => item.id === word.id);
        if (alreadyMissed) {
            return session;
        }

        return {
            ...session,
            missedWords: [...session.missedWords, word]
        };
    }

    function loadNextPrompt(session) {
        if (!session) return session;
        const baseState = resetQuestionState(session);

        if (baseState.remainingWords.length === 0) {
            if (baseState.phase === 'initial' && baseState.missedWords.length > 0) {
                const reviewWords = shuffle(baseState.missedWords);
                const nextWord = reviewWords.pop();
                const promptType = resolveQuestionType(baseState.mode);
                const currentPrompt = createPrompt(nextWord, promptType, baseState.wordBank);

                return {
                    ...baseState,
                    phase: 'review',
                    reviewTotal: baseState.missedWords.length,
                    remainingWords: reviewWords,
                    currentPrompt,
                    correctAnswer: currentPrompt?.correctResponse || '',
                    testComplete: false
                };
            }

            return {
                ...baseState,
                currentPrompt: null,
                correctAnswer: '',
                testComplete: true
            };
        }

        const remainingWords = baseState.remainingWords.slice();
        const nextWord = remainingWords.pop();
        const promptType = resolveQuestionType(baseState.mode);
        const currentPrompt = createPrompt(nextWord, promptType, baseState.wordBank);

        return {
            ...baseState,
            remainingWords,
            currentPrompt,
            correctAnswer: currentPrompt?.correctResponse || '',
            testComplete: false
        };
    }

    function answerMultipleChoice(session, option) {
        if (!session || !session.currentPrompt || session.currentPrompt.type !== 'multiple-choice' || session.questionAnswered) {
            return session;
        }

        const isCorrect = !!option.isCorrect;
        const scoreDelta = isCorrect && session.phase === 'initial' ? 1 : 0;
        const updatedSession = isCorrect
            ? session
            : addMissedWord(session, session.currentPrompt.sourceWord);

        return {
            ...updatedSession,
            questionAnswered: true,
            selectedOptionId: option.id,
            isCorrect,
            score: updatedSession.score + scoreDelta,
            answerFeedback: isCorrect ? 'Great job!' : 'Not quite. Keep practicing!'
        };
    }

    function answerWritten(session, answer) {
        if (!session || !session.currentPrompt || session.currentPrompt.type !== 'written' || session.questionAnswered) {
            return session;
        }

        const normalizedInput = normalizeText(answer);
        if (!normalizedInput) {
            return session;
        }

        const similarity = calculateSimilarity(
            normalizedInput,
            session.currentPrompt.normalizedCorrect
        );

        const isCorrect = similarity >= 0.95;
        let answerFeedback = 'Keep practicing that spelling.';
        if (isCorrect) {
            answerFeedback = 'Perfect!';
        } else if (similarity >= 0.8) {
            answerFeedback = 'Close! Double-check the spelling.';
        }

        const scoreDelta = isCorrect && session.phase === 'initial' ? 1 : 0;
        const updatedSession = isCorrect
            ? session
            : addMissedWord(session, session.currentPrompt.sourceWord);

        return {
            ...updatedSession,
            questionAnswered: true,
            isCorrect,
            score: updatedSession.score + scoreDelta,
            similarityScore: Math.round(similarity * 100),
            answerFeedback
        };
    }

    global.testEngine = {
        startSession: createSession,
        loadNextPrompt,
        answerMultipleChoice,
        answerWritten
    };
})(window);
