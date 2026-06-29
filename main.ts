import { App, ItemView, Modal, Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';

interface MediaConfig {
    appName: string;
    videoTypes: Record<string, string>;
    journalsPath: string;
    dateFormat: string;
}

interface MediaRecord {
    date: string;
    typeKey: string;
    typeName: string;
    title: string;
    comment: string;
    rawLine: string;
}

interface TypeTitleEntry {
    title: string;
    date: string;
    comment: string;
}

interface TypeItemStats {
    name: string;
    count: number;
    titles: TypeTitleEntry[];
}

interface PeriodTypeStats {
    count: number;
    types: Record<string, number>;
}

interface Statistics {
    totalVideos: number;
    typeStats: Record<string, TypeItemStats>;
    monthlyStats: Record<string, PeriodTypeStats>;
    yearlyStats: Record<string, PeriodTypeStats>;
}

interface Cache {
    records: MediaRecord[] | null;
    lastUpdate: number | null;
}

function formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/** 从 Daily Notes 核心插件获取配置，失败返回 null */
function getDailyNoteConfig(app: App): { format: string; folder: string } | null {
    try {
        const internalPlugins = (app as unknown as {
            internalPlugins: {
                getPluginById(id: string): {
                    enabled: boolean;
                    instance: { options?: { format?: string; folder?: string } };
                } | null;
            };
        }).internalPlugins;
        const plugin = internalPlugins.getPluginById('daily-notes');
        if (!plugin?.enabled) return null;
        const options = plugin.instance.options;
        if (!options) return null;
        const format = typeof options.format === 'string'
            ? options.format.replace(/YYYY/g, 'yyyy').replace(/DD/g, 'dd')
            : null;
        const folder = typeof options.folder === 'string' ? options.folder : null;
        if (!format && !folder) return null;
        return { format: format || 'yyyy-MM-dd', folder: folder || '' };
    } catch {
        return null;
    }
}

function normalizeJournalsPath(path: string): string {
    return (path || 'journals').trim().replace(/^\/+/, '').replace(/\/+$/, '') || 'journals';
}

interface DateFormatToken {
    component: 'year' | 'year2' | 'month' | 'day';
}

const WEEKDAY_CHAR_REGEX = /[一二三四五六日天]/;
const WEEKDAY_CHARS = ['日', '一', '二', '三', '四', '五', '六'];
const formatTokenCache = new Map<string, { regex: RegExp; tokens: DateFormatToken[] }>();

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseFormatTokens(format: string): { regex: RegExp; tokens: DateFormatToken[] } {
    const cached = formatTokenCache.get(format);
    if (cached) return cached;

    const tokens: DateFormatToken[] = [];
    let pattern = '';
    let i = 0;
    while (i < format.length) {
        if ((format.startsWith('YYYY', i) || format.startsWith('yyyy', i)) && (i + 4 <= format.length)) {
            pattern += '(\\d{4})';
            tokens.push({ component: 'year' });
            i += 4;
        } else if ((format.startsWith('YY', i) || format.startsWith('yy', i)) && (i + 2 <= format.length)) {
            pattern += '(\\d{2})';
            tokens.push({ component: 'year2' });
            i += 2;
        } else if (format.startsWith('MM', i)) {
            pattern += '(\\d{2})';
            tokens.push({ component: 'month' });
            i += 2;
        } else if ((format.startsWith('DD', i) || format.startsWith('dd', i)) && (i + 2 <= format.length)) {
            pattern += '(\\d{2})';
            tokens.push({ component: 'day' });
            i += 2;
        } else if (format.startsWith('星期', i)) {
            pattern += '星期[一二三四五六日天]';
            i += 2;
            if (i < format.length && WEEKDAY_CHAR_REGEX.test(format[i])) i += 1;
        } else if (format[i] === '周') {
            pattern += '周[一二三四五六日天]';
            i += 1;
            if (i < format.length && WEEKDAY_CHAR_REGEX.test(format[i])) i += 1;
        } else {
            pattern += escapeRegex(format[i]);
            i += 1;
        }
    }
    const result = { regex: new RegExp(pattern), tokens };
    formatTokenCache.set(format, result);
    return result;
}

function buildFilenameRegex(format: string): RegExp {
    const { regex } = parseFormatTokens(format);
    return new RegExp('^' + regex.source + '\\.md$');
}

function extractISOFromMatch(match: RegExpMatchArray, tokens: DateFormatToken[]): string | null {
    let year = '';
    let month = '';
    let day = '';
    for (let i = 0; i < tokens.length; i++) {
        const val = match[i + 1];
        if (tokens[i].component === 'year') year = val;
        else if (tokens[i].component === 'year2') year = '20' + val;
        else if (tokens[i].component === 'month') month = val;
        else if (tokens[i].component === 'day') day = val;
    }
    const iso = `${year}-${month}-${day}`;
    const parsed = new Date(iso);
    if (isNaN(parsed.getTime())) return null;
    return iso;
}

function parseDateFromPath(relativePath: string, format: string): string | null {
    const { regex, tokens } = parseFormatTokens(format);
    const fullRegex = new RegExp('^' + regex.source + '\\.md$');
    const match = relativePath.match(fullRegex);
    if (!match) return null;
    return extractISOFromMatch(match, tokens);
}

function parseDateFromString(str: string, format: string): string | null {
    const { regex, tokens } = parseFormatTokens(format);
    const match = str.match(regex);
    if (!match) return null;
    return extractISOFromMatch(match, tokens);
}

function isoToFileDate(isoDate: string, format: string): string {
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    const year4 = parts[0];
    const year2 = year4.slice(-2);
    const month = parts[1];
    const day = parts[2];
    const weekdayChar = WEEKDAY_CHARS[new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getDay()];
    return format
        .replace(/yyyy|YYYY/g, year4)
        .replace(/yy|YY/g, year2)
        .replace(/MM/g, month)
        .replace(/dd|DD/g, day)
        .replace(/星期[一二三四五六日天]?/g, '星期' + weekdayChar)
        .replace(/周[一二三四五六日天]?/g, '周' + weekdayChar);
}

function resolveFileDate(filePath: string, journalsPath: string, dateFormat: string): string {
    const prefix = journalsPath + '/';
    const relativePath = filePath.startsWith(prefix)
        ? filePath.slice(prefix.length)
        : filePath.split('/').pop() ?? filePath;
    return parseDateFromPath(relativePath, dateFormat)
        ?? parseDateFromString(filePath, dateFormat)
        ?? formatLocalDate(new Date());
}

class VideoParser {
    config: MediaConfig;

    constructor(config: MediaConfig) {
        this.config = config;
    }

    parseRecord(line: string, fileDate: string): MediaRecord[] | null {
        const { videoTypes } = this.config;
        const typeKeys = Object.keys(videoTypes);
        const matches: MediaRecord[] = [];

        typeKeys.forEach(typeKey => {
            const typePattern = new RegExp(`#${typeKey}\\b`, 'gi');
            if (typePattern.test(line)) {
                let content = line.replace(typePattern, '').trim();
                content = content.replace(/^-\s*/, '').trim();

                let title = '';
                let comment = '';

                const titleMatch = content.match(/《([^》]+)》/);
                if (titleMatch) {
                    title = titleMatch[1];
                    comment = content.replace(titleMatch[0], '').trim();
                } else {
                    const parts = content.split(/\s+/);
                    title = parts[0] || '未命名';
                    comment = parts.slice(1).join(' ');
                }

                const typeName = videoTypes[typeKey];
                if (typeName !== undefined) {
                    matches.push({
                        date: fileDate,
                        typeKey: typeKey,
                        typeName: typeName,
                        title: title || '未命名',
                        comment: comment,
                        rawLine: line.trim()
                    });
                }
            }
        });

        return matches.length > 0 ? matches : null;
    }

    parseFileContent(content: string, filePath: string): MediaRecord[] {
        const lines = content.split('\n');
        const records: MediaRecord[] = [];

        const fileDate = resolveFileDate(filePath, this.config.journalsPath, this.config.dateFormat);

        lines.forEach(line => {
            const lineRecords = this.parseRecord(line, fileDate);
            if (lineRecords) {
                records.push(...lineRecords);
            }
        });

        return records;
    }
}

class VideoStorage {
    app: App;
    config: MediaConfig;
    parser: VideoParser;
    cache: Cache;
    cacheTimeout: number;

    constructor(app: App, config: MediaConfig) {
        this.app = app;
        this.config = config;
        this.parser = new VideoParser(config);

        this.cache = {
            records: null,
            lastUpdate: null
        };

        this.cacheTimeout = 30 * 1000;
    }

    onFileChange(file: TFile): boolean {
        if (file.path.startsWith(this.config.journalsPath + '/') && file.extension === 'md') {
            this.clearCache();
            return true;
        }
        return false;
    }

    isCacheValid(): boolean {
        if (!this.cache.records || !this.cache.lastUpdate) {
            return false;
        }

        const now = Date.now();
        if ((now - this.cache.lastUpdate) > this.cacheTimeout) {
            return false;
        }

        return true;
    }

    clearCache(): void {
        this.cache.records = null;
        this.cache.lastUpdate = null;
    }

    async getAllRecords(forceRefresh = false): Promise<MediaRecord[]> {
        if (forceRefresh) {
            this.clearCache();
        }

        if (this.isCacheValid() && this.cache.records) {
            return this.cache.records;
        }

        const { vault } = this.app;
        const records: MediaRecord[] = [];

        const journalsPrefix = this.config.journalsPath + '/';
        const allFiles = vault.getMarkdownFiles().filter((file: TFile) =>
            file.path.startsWith(journalsPrefix)
        );

        const datePattern = buildFilenameRegex(this.config.dateFormat);
        const dateFiles = allFiles.filter((file: TFile) => datePattern.test(file.name));

        const batchSize = 50;
        for (let i = 0; i < dateFiles.length; i += batchSize) {
            const batch = dateFiles.slice(i, i + batchSize);

            const batchPromises = batch.map(async (file: TFile) => {
                try {
                    const content = await vault.cachedRead(file);
                    return this.parser.parseFileContent(content, file.path);
                } catch {
                    return [] as MediaRecord[];
                }
            });

            const batchResults = await Promise.all(batchPromises);
            batchResults.forEach(fileRecords => {
                records.push(...fileRecords);
            });
        }

        this.cache.records = records;
        this.cache.lastUpdate = Date.now();

        return records;
    }

    filterRecordsByDateRange(records: MediaRecord[], startDate: string, endDate: string): MediaRecord[] {
        return records.filter(record => {
            const recordDate = new Date(record.date);
            return recordDate >= new Date(startDate) && recordDate <= new Date(endDate);
        });
    }

    filterRecordsByYearMonth(records: MediaRecord[], year: number, month: number): MediaRecord[] {
        return records.filter(record => {
            const [recordYear, recordMonth] = record.date.split('-');
            return parseInt(recordYear, 10) === year && parseInt(recordMonth, 10) === month;
        });
    }

    calculateStatistics(records: MediaRecord[]): Statistics {
        const stats: Statistics = {
            totalVideos: records.length,
            typeStats: {},
            monthlyStats: {},
            yearlyStats: {}
        };

        records.forEach(record => {
            if (!stats.typeStats[record.typeKey]) {
                stats.typeStats[record.typeKey] = {
                    name: record.typeName,
                    count: 0,
                    titles: []
                };
            }
            const typeStat = stats.typeStats[record.typeKey];
            if (typeStat) {
                typeStat.count += 1;
                typeStat.titles.push({
                    title: record.title,
                    date: record.date,
                    comment: record.comment
                });
            }

            const yearMonth = record.date.substring(0, 7);
            if (!stats.monthlyStats[yearMonth]) {
                stats.monthlyStats[yearMonth] = {
                    count: 0,
                    types: {}
                };
            }
            const monthStat = stats.monthlyStats[yearMonth];
            if (monthStat) {
                monthStat.count += 1;
                if (!monthStat.types[record.typeKey]) {
                    monthStat.types[record.typeKey] = 0;
                }
                monthStat.types[record.typeKey] += 1;
            }

            const year = record.date.substring(0, 4);
            if (!stats.yearlyStats[year]) {
                stats.yearlyStats[year] = {
                    count: 0,
                    types: {}
                };
            }
            const yearStat = stats.yearlyStats[year];
            if (yearStat) {
                yearStat.count += 1;
                if (!yearStat.types[record.typeKey]) {
                    yearStat.types[record.typeKey] = 0;
                }
                yearStat.types[record.typeKey] += 1;
            }
        });

        return stats;
    }
}

class VideoConfigModal extends Modal {
    plugin: VideoTrackerPlugin;
    appName: string;
    journalsPath: string;
    videoTypes: Record<string, string>;
    currentTab: string;
    contentArea!: HTMLElement;
    typeList!: HTMLElement;

    constructor(app: App, plugin: VideoTrackerPlugin) {
        super(app);
        this.plugin = plugin;
        this.appName = plugin.config.appName || 'Media Journal';
        this.journalsPath = plugin.config.journalsPath || 'journals';
        this.videoTypes = { ...plugin.config.videoTypes };
        this.currentTab = 'basic';
    }

    onOpen(): void {
        const appName = this.plugin.config.appName || 'Media Journal';
        this.titleEl.setText(`${appName}配置`);

        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('video-config-modal');

        this.renderTabs(contentEl);
        this.contentArea = contentEl.createDiv('config-content');
        this.renderCurrentTab();

        const buttons = contentEl.createDiv('config-buttons');

        const cancelBtn = buttons.createEl('button', {
            text: '取消',
            cls: 'config-btn config-btn-cancel'
        });
        cancelBtn.onclick = () => this.close();

        const saveBtn = buttons.createEl('button', {
            text: '保存',
            cls: 'config-btn config-btn-save'
        });
        saveBtn.onclick = () => { void this.saveConfig(); };
    }

    renderTabs(container: HTMLElement): void {
        const tabsContainer = container.createDiv('config-tabs');

        const tabs = [
            { key: 'basic', label: '基础设置' },
            { key: 'types', label: '类型管理' }
        ];

        tabs.forEach(tab => {
            const tabBtn = tabsContainer.createEl('button', {
                text: tab.label,
                cls: `config-tab ${this.currentTab === tab.key ? 'active' : ''}`
            });
            tabBtn.onclick = () => this.switchTab(tab.key);
        });
    }

    switchTab(tabKey: string): void {
        this.currentTab = tabKey;

        const { activeDocument } = window;
        activeDocument.querySelectorAll('.config-tab').forEach(btn => {
            btn.classList.remove('active');
        });
        const tabIndex = tabKey === 'basic' ? 1 : 2;
        const el = activeDocument.querySelector(`.config-tab:nth-child(${tabIndex})`);
        if (el) el.classList.add('active');

        this.renderCurrentTab();
    }

    renderCurrentTab(): void {
        this.contentArea.empty();

        if (this.currentTab === 'basic') {
            this.renderBasicTab();
        } else {
            this.renderTypesTab();
        }
    }

    renderBasicTab(): void {
        const description = this.contentArea.createDiv('config-description');
        description.createEl('p', { text: '自定义应用名称' });

        const nameSection = this.contentArea.createDiv('config-section');
        nameSection.createEl('h3', { text: '应用名称' });

        const nameGroup = nameSection.createDiv('config-input-group');
        nameGroup.createEl('label', { text: '显示名称：' });
        const nameInput = nameGroup.createEl('input', {
            type: 'text',
            cls: 'config-text-input',
            value: this.appName,
            attr: { placeholder: 'Media Journal', maxlength: '20' }
        });
        nameInput.oninput = () => {
            this.appName = nameInput.value.trim() || 'Media Journal';
        };

        const dailyNoteConfig = getDailyNoteConfig(this.app);
        const journalsHint = dailyNoteConfig?.folder
            ? `检测到日记插件文件夹: ${dailyNoteConfig.folder}，已自动应用。可在此改为单独路径。`
            : '日记文件存放的文件夹路径（相对 vault 根目录），默认为 journals';

        const journalsSection = this.contentArea.createDiv('config-section');
        journalsSection.createEl('h3', { text: '日记文件夹路径' });
        journalsSection.createEl('p', { text: journalsHint, cls: 'config-description' });

        const journalsGroup = journalsSection.createDiv('config-input-group');
        journalsGroup.createEl('label', { text: '文件夹：' });
        const journalsInput = journalsGroup.createEl('input', {
            type: 'text',
            cls: 'config-text-input',
            value: this.journalsPath,
            attr: { placeholder: 'journals' }
        });
        journalsInput.oninput = () => {
            this.journalsPath = normalizeJournalsPath(journalsInput.value);
        };

        const previewSection = this.contentArea.createDiv('config-section');
        previewSection.createEl('h3', { text: '使用示例' });

        const previewBox = previewSection.createDiv('config-preview-box');
        const previewContent = previewBox.createEl('div', {
            cls: 'preview-content'
        });

        const examples = [
            '- #movie 《肖申克的救赎》 经典之作，值得反复观看',
            '- #tv 《权力的游戏》 史诗级剧集',
            '- #variety 《向往的生活》 轻松愉快'
        ];
        examples.forEach(line => {
            const p = previewContent.createEl('p');
            p.createEl('code', { text: line });
        });
    }

    renderTypesTab(): void {
        const description = this.contentArea.createDiv('config-description');
        description.createEl('p', { text: '配置影视类型关键词和对应的中文名称' });
        const usage = description.createEl('p');
        usage.createEl('strong', { text: '使用方法：' });
        usage.appendText(' 在日记中写 ');
        usage.createEl('code', { text: '#movie' });
        usage.appendText(' 表示观看电影');

        this.typeList = this.contentArea.createDiv('type-list');
        this.renderTypeList();

        const addButton = this.contentArea.createEl('button', {
            text: '+ 添加新类型',
            cls: 'add-type-btn'
        });
        addButton.onclick = () => this.addNewType();
    }

    renderTypeList(): void {
        this.typeList.empty();

        Object.entries(this.videoTypes).forEach(([key, name]) => {
            const item = this.typeList.createDiv('type-item');

            const keyInput = item.createEl('input', {
                type: 'text',
                cls: 'type-key',
                value: key,
                placeholder: '关键词'
            });
            keyInput.maxLength = 20;

            const nameInput = item.createEl('input', {
                type: 'text',
                cls: 'type-name',
                value: name,
                placeholder: '类型名称'
            });
            nameInput.maxLength = 20;

            const deleteBtn = item.createEl('button', {
                text: '删除',
                cls: 'delete-type-btn'
            });
            deleteBtn.onclick = () => this.deleteType(key);

            keyInput.oninput = () => this.updateType(key, keyInput.value, nameInput.value);
            nameInput.oninput = () => this.updateType(key, keyInput.value, nameInput.value);
        });
    }

    addNewType(): void {
        const newKey = `type${Date.now()}`;
        this.videoTypes[newKey] = '新类型';
        this.renderTypeList();
    }

    deleteType(key: string): void {
        delete this.videoTypes[key];
        this.renderTypeList();
    }

    updateType(oldKey: string, newKey: string, name: string): void {
        if (oldKey !== newKey) {
            delete this.videoTypes[oldKey];
        }
        this.videoTypes[newKey] = name;
    }

    async saveConfig(): Promise<void> {
        try {
            const cleanAppName = this.appName.trim();
            if (!cleanAppName) {
                new Notice('应用名称不能为空');
                return;
            }

            const cleanTypes: Record<string, string> = {};
            for (const [key, name] of Object.entries(this.videoTypes)) {
                const cleanKey = key.trim();
                const cleanName = name.trim();

                if (cleanKey && cleanName) {
                    cleanTypes[cleanKey] = cleanName;
                }
            }

            if (Object.keys(cleanTypes).length === 0) {
                new Notice('至少需要一个影视类型');
                return;
            }

            this.plugin.config.appName = cleanAppName;
            this.plugin.config.videoTypes = cleanTypes;
            this.plugin.config.journalsPath = normalizeJournalsPath(this.journalsPath);

            const configPath = `${this.plugin.manifest.dir}/config.json`;
            const adapter = this.app.vault.adapter;
            const configContent = JSON.stringify(this.plugin.config, null, 4);
            await adapter.write(configPath, configContent);

            this.plugin.storage.clearCache();

            new Notice('配置已保存，正在刷新...');
            this.close();

            const leaves = this.app.workspace.getLeavesOfType(MEDIA_JOURNAL_VIEW);
            for (const leaf of leaves) {
                await leaf.setViewState({ type: 'empty' });
            }

            window.setTimeout(() => {
                void this.plugin.activateView();
                new Notice('配置已保存并刷新');
            }, 100);
        } catch {
            new Notice('保存配置失败');
        }
    }
}

const MEDIA_JOURNAL_VIEW = 'media-journal-view';

class VideoTrackerView extends ItemView {
    plugin: VideoTrackerPlugin;
    currentRecords: MediaRecord[];
    currentStats: Statistics | null;
    currentYear: number;
    currentMonth: number;
    filteredRecords!: MediaRecord[];
    statsContainer!: HTMLElement;
    videoListContainer!: HTMLElement;

    constructor(leaf: WorkspaceLeaf, plugin: VideoTrackerPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.currentRecords = [];
        this.currentStats = null;
        this.currentYear = new Date().getFullYear();
        this.currentMonth = 0;
    }

    getViewType(): string {
        return MEDIA_JOURNAL_VIEW;
    }

    getDisplayText(): string {
        return this.plugin.config.appName || 'Media Journal';
    }

    getIcon(): string {
        return 'film';
    }

    async onOpen(): Promise<void> {
        await this.render();
    }

    async onClose(): Promise<void> {
        // 清理资源
    }

    async render(): Promise<void> {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('media-journal-view');

        this.renderHeader(container);
        this.renderYearMonthSelector(container);
        this.renderStats(container);
        this.renderVideoList(container);

        await this.loadAllRecords();
    }

    renderHeader(container: HTMLElement): void {
        const header = container.createDiv('video-header');

        const appName = this.plugin.config.appName || 'Media Journal';
        header.createEl('h2', { text: `🎬 ${appName}`, cls: 'video-title' });

        const actions = header.createDiv('video-actions');

        const refreshBtn = actions.createEl('button', {
            text: '刷新数据',
            cls: 'video-btn'
        });
        refreshBtn.onclick = () => { void this.loadAllRecords(true); };

        const configBtn = actions.createEl('button', {
            text: '配置',
            cls: 'video-btn'
        });
        configBtn.onclick = () => this.showConfigModal();
    }

    renderYearMonthSelector(container: HTMLElement): void {
        const selector = container.createDiv('year-month-selector');

        const yearGroup = selector.createDiv('selector-group');
        yearGroup.createEl('label', { text: '年份：' });

        const yearSelect = yearGroup.createEl('select', { cls: 'year-select' });
        const currentYear = new Date().getFullYear();
        for (let year = currentYear; year >= currentYear - 2; year--) {
            const option = yearSelect.createEl('option', {
                value: year.toString(),
                text: `${year}年`
            });
            if (year === this.currentYear) {
                option.selected = true;
            }
        }

        yearSelect.onchange = () => {
            this.currentYear = parseInt(yearSelect.value, 10);
            this.applyYearMonthFilter();
        };

        const monthGroup = selector.createDiv('selector-group');
        monthGroup.createEl('label', { text: '月份：' });

        const monthSelect = monthGroup.createEl('select', { cls: 'month-select' });
        const allOption = monthSelect.createEl('option', {
            value: '0',
            text: '全年'
        });
        if (this.currentMonth === 0) {
            allOption.selected = true;
        }

        for (let month = 1; month <= 12; month++) {
            const option = monthSelect.createEl('option', {
                value: month.toString(),
                text: `${month}月`
            });
            if (month === this.currentMonth) {
                option.selected = true;
            }
        }

        monthSelect.onchange = () => {
            this.currentMonth = parseInt(monthSelect.value, 10);
            this.applyYearMonthFilter();
        };
    }

    applyYearMonthFilter(): void {
        if (this.currentMonth === 0) {
            const startDate = `${this.currentYear}-01-01`;
            const endDate = `${this.currentYear}-12-31`;
            this.filteredRecords = this.plugin.storage.filterRecordsByDateRange(
                this.currentRecords, startDate, endDate
            );
        } else {
            this.filteredRecords = this.plugin.storage.filterRecordsByYearMonth(
                this.currentRecords, this.currentYear, this.currentMonth
            );
        }

        this.currentStats = this.plugin.storage.calculateStatistics(this.filteredRecords);

        this.updateStatsDisplay();
        this.updateVideoListDisplay();
    }

    renderStats(container: HTMLElement): void {
        this.statsContainer = container.createDiv('video-stats');
        this.updateStatsDisplay();
    }

    renderVideoList(container: HTMLElement): void {
        const listSection = container.createDiv('video-list-section');
        listSection.createEl('h3', { text: '观看记录', cls: 'section-title' });
        this.videoListContainer = listSection.createDiv('video-list');
        this.updateVideoListDisplay();
    }

    async loadAllRecords(forceRefresh = false): Promise<void> {
        try {
            if (forceRefresh) {
                new Notice('正在刷新观看数据...');
            }

            this.currentRecords = await this.plugin.storage.getAllRecords(forceRefresh);
            this.applyYearMonthFilter();

            const message = forceRefresh
                ? `已刷新并加载 ${this.currentRecords.length} 条观看记录`
                : `已加载 ${this.currentRecords.length} 条观看记录`;
            new Notice(message);
        } catch {
            new Notice('加载观看记录失败');
        }
    }

    updateStatsDisplay(): void {
        if (!this.statsContainer) return;

        this.statsContainer.empty();

        if (!this.currentStats) {
            this.statsContainer.createDiv({ text: '暂无数据', cls: 'no-data' });
            return;
        }

        const { totalVideos, typeStats } = this.currentStats;

        const overview = this.statsContainer.createDiv('stats-overview');

        const totalCard = overview.createDiv('stat-card total');
        totalCard.createDiv({ text: '总观看数', cls: 'stat-label' });
        totalCard.createDiv({ text: `${totalVideos}`, cls: 'stat-value' });

        Object.entries(typeStats).forEach(([typeKey, data]) => {
            const typeCard = overview.createDiv(`stat-card type-${typeKey}`);
            typeCard.createDiv({ text: data.name, cls: 'stat-label' });
            typeCard.createDiv({ text: `${data.count}`, cls: 'stat-value' });
        });
    }

    updateVideoListDisplay(): void {
        if (!this.videoListContainer) return;

        this.videoListContainer.empty();

        if (!this.filteredRecords || this.filteredRecords.length === 0) {
            this.videoListContainer.createDiv({ text: '暂无观看记录', cls: 'no-data' });
            return;
        }

        const recordsByDate: Record<string, MediaRecord[]> = {};
        this.filteredRecords.forEach(record => {
            if (!recordsByDate[record.date]) {
                recordsByDate[record.date] = [];
            }
            const group = recordsByDate[record.date];
            if (group) {
                group.push(record);
            }
        });

        const sortedDates = Object.keys(recordsByDate).sort().reverse();

        sortedDates.forEach(date => {
            const dateGroup = this.videoListContainer.createDiv('video-date-group');

            const dateHeader = dateGroup.createDiv('video-date-header');
            const dateObj = new Date(date);
            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const weekday = weekdays[dateObj.getDay()];

            const dateText = dateHeader.createEl('span', {
                text: date,
                cls: 'video-date-text clickable'
            });
            dateHeader.createEl('span', {
                text: weekday,
                cls: 'video-weekday'
            });

            dateText.onclick = () => {
                void this.openDailyNote(date);
            };

            const records = recordsByDate[date];
            if (!records) return;

            const recordsContainer = dateGroup.createDiv('video-records');

            records.forEach(record => {
                const recordItem = recordsContainer.createDiv('video-record-item');

                const typeTag = recordItem.createDiv(`video-type-tag type-${record.typeKey}`);
                typeTag.textContent = record.typeName;

                const contentArea = recordItem.createDiv('video-content');

                const titleEl = contentArea.createDiv('video-title-text');
                titleEl.textContent = record.title;

                if (record.comment) {
                    const commentEl = contentArea.createDiv('video-comment');
                    commentEl.textContent = record.comment;
                }
            });
        });
    }

    async openDailyNote(dateStr: string): Promise<void> {
        try {
            const fileDate = isoToFileDate(dateStr, this.plugin.config.dateFormat);
            const fileName = `${this.plugin.config.journalsPath}/${fileDate}.md`;
            const file = this.app.vault.getAbstractFileByPath(fileName);

            if (!(file instanceof TFile)) {
                new Notice(`日记文件不存在: ${dateStr}`);
                return;
            }

            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(file);
        } catch {
            new Notice('打开日记失败');
        }
    }

    showConfigModal(): void {
        new VideoConfigModal(this.app, this.plugin).open();
    }
}

class VideoTrackerPlugin extends Plugin {
    config!: MediaConfig;
    storage!: VideoStorage;

    async onload(): Promise<void> {
        await this.loadConfig();
        this.storage = new VideoStorage(this.app, this.config);

        this.registerView(MEDIA_JOURNAL_VIEW, (leaf: WorkspaceLeaf) => new VideoTrackerView(leaf, this));

        const appName = this.config.appName || 'Media Journal';
        this.addRibbonIcon('film', appName, () => {
            void this.activateView();
        });

        this.addCommand({
            id: 'open-view',
            name: 'Open view',
            callback: () => { void this.activateView(); }
        });

        this.addCommand({
            id: 'refresh-data',
            name: 'Refresh data',
            callback: () => { void this.refreshData(); }
        });

        this.registerEvent(
            this.app.metadataCache.on('changed', (file: TFile) => {
                if (file instanceof TFile && this.storage.onFileChange(file)) {
                    void this.refreshData();
                }
            })
        );
    }

    onunload(): void {
        // Obsidian 会在卸载插件时自动清理 view，无需手动 detach leaves
    }

    async loadConfig(): Promise<void> {
        try {
            const configPath = `${this.manifest.dir}/config.json`;
            const adapter = this.app.vault.adapter;

            if (await adapter.exists(configPath)) {
                const configContent = await adapter.read(configPath);
                this.config = JSON.parse(configContent) as MediaConfig;
            } else {
                this.config = this.getDefaultConfig();
            }
        } catch {
            this.config = this.getDefaultConfig();
        }
        this.applyDailyNoteConfig();
    }

    applyDailyNoteConfig(): void {
        const dailyNoteConfig = getDailyNoteConfig(this.app);
        if (!this.config.journalsPath || typeof this.config.journalsPath !== 'string') {
            this.config.journalsPath = dailyNoteConfig?.folder || 'journals';
        }
        if (!this.config.dateFormat || typeof this.config.dateFormat !== 'string') {
            this.config.dateFormat = dailyNoteConfig?.format || 'yyyy-MM-dd';
        }
        this.config.journalsPath = normalizeJournalsPath(this.config.journalsPath);
    }

    getDefaultConfig(): MediaConfig {
        return {
            appName: "Media Journal",
            videoTypes: {
                "movie": "电影",
                "tv": "电视剧",
                "variety": "综艺",
                "book": "书籍"
            },
            journalsPath: "journals",
            dateFormat: "yyyy-MM-dd"
        };
    }

    async activateView(): Promise<void> {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType(MEDIA_JOURNAL_VIEW)[0];

        if (!leaf) {
            leaf = workspace.getLeaf('tab');
            await leaf.setViewState({
                type: MEDIA_JOURNAL_VIEW,
                active: true
            });
        }

        workspace.setActiveLeaf(leaf, { focus: true });
    }

    async refreshData(): Promise<void> {
        const leaves = this.app.workspace.getLeavesOfType(MEDIA_JOURNAL_VIEW);
        for (const leaf of leaves) {
            if (leaf.view instanceof VideoTrackerView) {
                await leaf.view.loadAllRecords(true);
            }
        }
    }
}

export default VideoTrackerPlugin;
