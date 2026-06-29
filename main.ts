const { Plugin, ItemView, Modal, Notice, TFile } = require('obsidian');

// 辅助函数：格式化本地日期为 YYYY-MM-DD（避免 UTC 时区问题）
function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 影视记录解析器
class VideoParser {
    constructor(config) {
        this.config = config;
    }

    // 解析单行影视记录
    parseRecord(line, fileDate) {
        const { videoTypes } = this.config;
        
        // 匹配视频类型
        const typeKeys = Object.keys(videoTypes);
        const matches = [];
        
        typeKeys.forEach(typeKey => {
            const typePattern = new RegExp(`#${typeKey}\\b`, 'gi');
            if (typePattern.test(line)) {
                // 提取视频名称和评论
                let content = line.replace(typePattern, '').trim();
                content = content.replace(/^-\s*/, '').trim();
                
                // 尝试分离标题和评论
                let title = '';
                let comment = '';
                
                // 如果有《》包裹的标题
                const titleMatch = content.match(/《([^》]+)》/);
                if (titleMatch) {
                    title = titleMatch[1];
                    comment = content.replace(titleMatch[0], '').trim();
                } else {
                    // 否则第一个词作为标题，其余作为评论
                    const parts = content.split(/\s+/);
                    title = parts[0] || '未命名';
                    comment = parts.slice(1).join(' ');
                }
                
                matches.push({
                    date: fileDate,
                    typeKey: typeKey,
                    typeName: videoTypes[typeKey],
                    title: title || '未命名',
                    comment: comment,
                    rawLine: line.trim()
                });
            }
        });
        
        return matches.length > 0 ? matches : null;
    }

    // 解析文件内容
    parseFileContent(content, filePath) {
        const lines = content.split('\n');
        const records = [];
        
        // 从文件路径提取日期
        const dateMatch = filePath.match(/(\d{4}-\d{2}-\d{2})/);
        const fileDate = dateMatch ? dateMatch[1] : formatLocalDate(new Date());

        lines.forEach(line => {
            const lineRecords = this.parseRecord(line, fileDate);
            if (lineRecords) {
                records.push(...lineRecords);
            }
        });

        return records;
    }
}

// 影视数据管理器
class VideoStorage {
    constructor(app, config) {
        this.app = app;
        this.config = config;
        this.parser = new VideoParser(config);
        
        // 缓存机制
        this.cache = {
            records: null,
            lastUpdate: null
        };
        
        this.cacheTimeout = 30 * 1000; // 30秒缓存
        
        // 监听文件变化
        this.setupFileWatcher();
    }
    
    setupFileWatcher() {
        this.app.vault.on('modify', (file) => {
            if (file.path.startsWith(this.config.journalsPath) && file.path.endsWith('.md')) {
                this.clearCache();
            }
        });
        
        this.app.vault.on('create', (file) => {
            if (file.path.startsWith(this.config.journalsPath) && file.path.endsWith('.md')) {
                this.clearCache();
            }
        });
        
        this.app.vault.on('delete', (file) => {
            if (file.path.startsWith(this.config.journalsPath) && file.path.endsWith('.md')) {
                this.clearCache();
            }
        });
    }

    destroy() {
        this.app.vault.off('modify');
        this.app.vault.off('create');
        this.app.vault.off('delete');
    }
    
    isCacheValid() {
        if (!this.cache.records || !this.cache.lastUpdate) {
            return false;
        }
        
        const now = Date.now();
        if ((now - this.cache.lastUpdate) > this.cacheTimeout) {
            return false;
        }
        
        return true;
    }
    
    clearCache() {
        this.cache.records = null;
        this.cache.lastUpdate = null;
    }

    // 获取所有观看记录
    async getAllRecords(forceRefresh = false) {
        if (forceRefresh) {
            this.clearCache();
        }
        
        if (this.isCacheValid()) {
            return this.cache.records;
        }
        
        const { vault } = this.app;
        const records = [];
        
        // 获取所有日记文件
        const allFiles = vault.getMarkdownFiles().filter(file => 
            file.path.startsWith(this.config.journalsPath)
        );
        
        // 只保留日期格式的文件
        const datePattern = /\d{4}-\d{2}-\d{2}\.md$/;
        const dateFiles = allFiles.filter(file => datePattern.test(file.name));
        
        // 批量处理
        const batchSize = 50;
        for (let i = 0; i < dateFiles.length; i += batchSize) {
            const batch = dateFiles.slice(i, i + batchSize);
            
            const batchPromises = batch.map(async (file) => {
                try {
                    const content = await vault.cachedRead(file);
                    return this.parser.parseFileContent(content, file.path);
                } catch {
                    return [];
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            batchResults.forEach(fileRecords => {
                records.push(...fileRecords);
            });
        }
        
        // 更新缓存
        this.cache.records = records;
        this.cache.lastUpdate = Date.now();
        
        return records;
    }

    // 按日期范围筛选记录
    filterRecordsByDateRange(records, startDate, endDate) {
        return records.filter(record => {
            const recordDate = new Date(record.date);
            return recordDate >= new Date(startDate) && recordDate <= new Date(endDate);
        });
    }

    // 按年月筛选记录
    filterRecordsByYearMonth(records, year, month) {
        return records.filter(record => {
            const [recordYear, recordMonth] = record.date.split('-');
            return parseInt(recordYear) === year && parseInt(recordMonth) === month;
        });
    }

    // 统计数据
    calculateStatistics(records) {
        const stats = {
            totalVideos: records.length,
            typeStats: {},
            monthlyStats: {},
            yearlyStats: {}
        };

        // 按类型统计
        records.forEach(record => {
            if (!stats.typeStats[record.typeKey]) {
                stats.typeStats[record.typeKey] = {
                    name: record.typeName,
                    count: 0,
                    titles: []
                };
            }
            stats.typeStats[record.typeKey].count += 1;
            stats.typeStats[record.typeKey].titles.push({
                title: record.title,
                date: record.date,
                comment: record.comment
            });

            // 按月统计
            const yearMonth = record.date.substring(0, 7); // yyyy-mm
            if (!stats.monthlyStats[yearMonth]) {
                stats.monthlyStats[yearMonth] = {
                    count: 0,
                    types: {}
                };
            }
            stats.monthlyStats[yearMonth].count += 1;
            if (!stats.monthlyStats[yearMonth].types[record.typeKey]) {
                stats.monthlyStats[yearMonth].types[record.typeKey] = 0;
            }
            stats.monthlyStats[yearMonth].types[record.typeKey] += 1;

            // 按年统计
            const year = record.date.substring(0, 4);
            if (!stats.yearlyStats[year]) {
                stats.yearlyStats[year] = {
                    count: 0,
                    types: {}
                };
            }
            stats.yearlyStats[year].count += 1;
            if (!stats.yearlyStats[year].types[record.typeKey]) {
                stats.yearlyStats[year].types[record.typeKey] = 0;
            }
            stats.yearlyStats[year].types[record.typeKey] += 1;
        });

        return stats;
    }
}

// 影视配置模态框
class VideoConfigModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
        this.appName = plugin.config.appName || 'Media Journal';
        this.videoTypes = { ...plugin.config.videoTypes };
        this.currentTab = 'basic';
    }

    onOpen() {
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
        saveBtn.onclick = () => this.saveConfig();
    }

    renderTabs(container) {
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

    switchTab(tabKey) {
        this.currentTab = tabKey;
        
        document.querySelectorAll('.config-tab').forEach(btn => {
            btn.classList.remove('active');
        });
        const tabIndex = tabKey === 'basic' ? 1 : 2;
        document.querySelector(`.config-tab:nth-child(${tabIndex})`).classList.add('active');
        
        this.renderCurrentTab();
    }

    renderCurrentTab() {
        this.contentArea.empty();
        
        if (this.currentTab === 'basic') {
            this.renderBasicTab();
        } else {
            this.renderTypesTab();
        }
    }

    renderBasicTab() {
        const description = this.contentArea.createDiv('config-description');
        description.innerHTML = `
            <p>自定义应用名称</p>
        `;

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

        const previewSection = this.contentArea.createDiv('config-section');
        previewSection.createEl('h3', { text: '使用示例' });
        
        const previewBox = previewSection.createDiv('config-preview-box');
        const previewContent = previewBox.createEl('div', { 
            cls: 'preview-content'
        });
        
        previewContent.innerHTML = `
            <p><code>- #movie 《肖申克的救赎》 经典之作，值得反复观看</code></p>
            <p><code>- #tv 《权力的游戏》 史诗级剧集</code></p>
            <p><code>- #variety 《向往的生活》 轻松愉快</code></p>
        `;
    }

    renderTypesTab() {
        const description = this.contentArea.createDiv('config-description');
        description.innerHTML = `
            <p>配置影视类型关键词和对应的中文名称</p>
            <p><strong>使用方法：</strong> 在日记中写 <code>#movie</code> 表示观看电影</p>
        `;

        this.typeList = this.contentArea.createDiv('type-list');
        this.renderTypeList();

        const addButton = this.contentArea.createEl('button', {
            text: '+ 添加新类型',
            cls: 'add-type-btn'
        });
        addButton.onclick = () => this.addNewType();
    }

    renderTypeList() {
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

    addNewType() {
        const newKey = `type${Date.now()}`;
        this.videoTypes[newKey] = '新类型';
        this.renderTypeList();
    }

    deleteType(key) {
        delete this.videoTypes[key];
        this.renderTypeList();
    }

    updateType(oldKey, newKey, name) {
        if (oldKey !== newKey) {
            delete this.videoTypes[oldKey];
        }
        this.videoTypes[newKey] = name;
    }

    async saveConfig() {
        try {
            const cleanAppName = this.appName.trim();
            if (!cleanAppName) {
                new Notice('应用名称不能为空');
                return;
            }

            const cleanTypes = {};
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
            
            setTimeout(async () => {
                await this.plugin.activateView();
                new Notice('配置已保存并刷新');
            }, 100);
        } catch {
            new Notice('保存配置失败');
        }
    }
}

// 影视追踪视图
const MEDIA_JOURNAL_VIEW = 'media-journal-view';

class VideoTrackerView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.currentRecords = [];
        this.currentStats = null;
        this.currentYear = new Date().getFullYear();
        this.currentMonth = 0; // 0 表示全年
    }

    getViewType() {
        return MEDIA_JOURNAL_VIEW;
    }

    getDisplayText() {
        return this.plugin.config.appName || 'Media Journal';
    }

    getIcon() {
        return 'film';
    }

    async onOpen() {
        await this.render();
    }

    async onClose() {
        // 清理资源
    }

    async render() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('media-journal-view');

        this.renderHeader(container);
        this.renderYearMonthSelector(container);
        this.renderStats(container);
        this.renderVideoList(container);
        
        await this.loadAllRecords();
    }

    renderHeader(container) {
        const header = container.createDiv('video-header');
        
        const appName = this.plugin.config.appName || 'Media Journal';
        header.createEl('h2', { text: `🎬 ${appName}`, cls: 'video-title' });
        
        const actions = header.createDiv('video-actions');
        
        const refreshBtn = actions.createEl('button', {
            text: '刷新数据',
            cls: 'video-btn'
        });
        refreshBtn.onclick = () => this.loadAllRecords(true);

        const configBtn = actions.createEl('button', {
            text: '配置',
            cls: 'video-btn'
        });
        configBtn.onclick = () => this.showConfigModal();
    }

    renderYearMonthSelector(container) {
        const selector = container.createDiv('year-month-selector');
        
        // 年份选择
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
            this.currentYear = parseInt(yearSelect.value);
            this.applyYearMonthFilter();
        };
        
        // 月份选择
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
            this.currentMonth = parseInt(monthSelect.value);
            this.applyYearMonthFilter();
        };
    }

    applyYearMonthFilter() {
        if (this.currentMonth === 0) {
            // 显示全年
            const startDate = `${this.currentYear}-01-01`;
            const endDate = `${this.currentYear}-12-31`;
            this.filteredRecords = this.plugin.storage.filterRecordsByDateRange(
                this.currentRecords, startDate, endDate
            );
        } else {
            // 显示指定月份
            this.filteredRecords = this.plugin.storage.filterRecordsByYearMonth(
                this.currentRecords, this.currentYear, this.currentMonth
            );
        }
        
        this.currentStats = this.plugin.storage.calculateStatistics(this.filteredRecords);
        
        this.updateStatsDisplay();
        this.updateVideoListDisplay();
    }

    renderStats(container) {
        this.statsContainer = container.createDiv('video-stats');
        this.updateStatsDisplay();
    }

    renderVideoList(container) {
        const listSection = container.createDiv('video-list-section');
        listSection.createEl('h3', { text: '观看记录', cls: 'section-title' });
        this.videoListContainer = listSection.createDiv('video-list');
        this.updateVideoListDisplay();
    }

    async loadAllRecords(forceRefresh = false) {
        try {
            if (forceRefresh) {
                new Notice('正在刷新观看数据...');
            }
            
            this.currentRecords = await this.plugin.storage.getAllRecords(forceRefresh);
            
            // 默认显示当前月份数据
            this.applyYearMonthFilter();
            
            const message = forceRefresh 
                ? `已刷新并加载 ${this.currentRecords.length} 条观看记录`
                : `已加载 ${this.currentRecords.length} 条观看记录`;
            new Notice(message);
        } catch {
            new Notice('加载观看记录失败');
        }
    }

    updateStatsDisplay() {
        if (!this.statsContainer) return;
        
        this.statsContainer.empty();
        
        if (!this.currentStats) {
            this.statsContainer.createDiv({ text: '暂无数据', cls: 'no-data' });
            return;
        }

        const { totalVideos, typeStats } = this.currentStats;

        // 总览统计
        const overview = this.statsContainer.createDiv('stats-overview');
        
        const totalCard = overview.createDiv('stat-card total');
        totalCard.createDiv({ text: '总观看数', cls: 'stat-label' });
        totalCard.createDiv({ text: `${totalVideos}`, cls: 'stat-value' });

        // 各类型统计
        Object.entries(typeStats).forEach(([typeKey, data]) => {
            const typeCard = overview.createDiv(`stat-card type-${typeKey}`);
            typeCard.createDiv({ text: data.name, cls: 'stat-label' });
            typeCard.createDiv({ text: `${data.count}`, cls: 'stat-value' });
        });
    }

    updateVideoListDisplay() {
        if (!this.videoListContainer) return;
        
        this.videoListContainer.empty();
        
        if (!this.filteredRecords || this.filteredRecords.length === 0) {
            this.videoListContainer.createDiv({ text: '暂无观看记录', cls: 'no-data' });
            return;
        }
        
        // 按日期分组
        const recordsByDate = {};
        this.filteredRecords.forEach(record => {
            if (!recordsByDate[record.date]) {
                recordsByDate[record.date] = [];
            }
            recordsByDate[record.date].push(record);
        });
        
        // 按日期倒序排列
        const sortedDates = Object.keys(recordsByDate).sort().reverse();
        
        sortedDates.forEach(date => {
            const dateGroup = this.videoListContainer.createDiv('video-date-group');
            
            // 日期标题
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
            
            // 添加点击事件，打开对应日期的日记
            dateText.onclick = async () => {
                await this.openDailyNote(date);
            };
            
            // 观看记录
            const records = recordsByDate[date];
            const recordsContainer = dateGroup.createDiv('video-records');
            
            records.forEach(record => {
                const recordItem = recordsContainer.createDiv('video-record-item');
                
                // 类型标签
                const typeTag = recordItem.createDiv(`video-type-tag type-${record.typeKey}`);
                typeTag.textContent = record.typeName;
                
                // 内容区域
                const contentArea = recordItem.createDiv('video-content');
                
                // 标题
                const titleEl = contentArea.createDiv('video-title-text');
                titleEl.textContent = record.title;
                
                // 评论
                if (record.comment) {
                    const commentEl = contentArea.createDiv('video-comment');
                    commentEl.textContent = record.comment;
                }
            });
        });
    }
    
    async openDailyNote(dateStr) {
        try {
            const fileName = `${this.plugin.config.journalsPath}/${dateStr}.md`;
            const file = this.app.vault.getAbstractFileByPath(fileName);
            
            if (!file) {
                new Notice(`日记文件不存在: ${dateStr}`);
                return;
            }
            
            // 打开文件
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(file);
            
        } catch {
            new Notice('打开日记失败');
        }
    }

    showConfigModal() {
        new VideoConfigModal(this.app, this.plugin).open();
    }
}

// 主插件类
class VideoTrackerPlugin extends Plugin {
    async onload() {
        await this.loadConfig();
        this.storage = new VideoStorage(this.app, this.config);

        this.registerView(MEDIA_JOURNAL_VIEW, (leaf) => new VideoTrackerView(leaf, this));

        const appName = this.config.appName || 'Media Journal';
        this.addRibbonIcon('film', appName, () => {
            this.activateView();
        });

        this.addCommand({
            id: 'open-view',
            name: 'Open view',
            callback: () => this.activateView()
        });

        this.addCommand({
            id: 'refresh-data',
            name: 'Refresh data',
            callback: () => this.refreshData()
        });
    }

    async onunload() {
        if (this.storage) {
            this.storage.destroy();
        }
        
        this.app.workspace.detachLeavesOfType(MEDIA_JOURNAL_VIEW);
    }

    async loadConfig() {
        try {
            const configPath = `${this.manifest.dir}/config.json`;
            const adapter = this.app.vault.adapter;
            
            if (await adapter.exists(configPath)) {
                const configContent = await adapter.read(configPath);
                this.config = JSON.parse(configContent);
            } else {
                this.config = this.getDefaultConfig();
            }
        } catch {
            this.config = this.getDefaultConfig();
        }
    }

    getDefaultConfig() {
        return {
            appName: "Media Journal",
            videoTypes: {
                "movie": "电影",
                "tv": "电视剧",
                "variety": "综艺",
                "book": "书籍"
            },
            journalsPath: "journals"
        };
    }

    async activateView() {
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

    async refreshData() {
        const leaves = this.app.workspace.getLeavesOfType(MEDIA_JOURNAL_VIEW);
        for (const leaf of leaves) {
            if (leaf.view instanceof VideoTrackerView) {
                await leaf.view.loadAllRecords(true);
            }
        }
    }
}

module.exports = VideoTrackerPlugin;
