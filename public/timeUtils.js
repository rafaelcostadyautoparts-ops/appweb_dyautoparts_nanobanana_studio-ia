(function () {
    const BR_TIME_ZONE = 'America/Sao_Paulo';
    const BR_LOCALE = 'pt-BR';
    const LOCAL_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

    function getLocalDateTimeMatch(value) {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) return null;
        return trimmed.match(LOCAL_DATETIME_RE);
    }

    function getBrazilDateParts(value = new Date()) {
        const localMatch = getLocalDateTimeMatch(value);
        if (localMatch) {
            return {
                year: localMatch[1],
                month: localMatch[2],
                day: localMatch[3],
                hour: localMatch[4] || '00',
                minute: localMatch[5] || '00',
                second: localMatch[6] || '00'
            };
        }

        const date = value instanceof Date ? value : new Date(value);
        const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: BR_TIME_ZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        return formatter.formatToParts(safeDate).reduce((acc, part) => {
            if (part.type !== 'literal') acc[part.type] = part.value;
            return acc;
        }, {});
    }

    function getDataHoraBrasil(value = new Date()) {
        const parts = getBrazilDateParts(value);
        return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
    }

    function getDataBrasilISO(value = new Date()) {
        const parts = getBrazilDateParts(value);
        return `${parts.year}-${parts.month}-${parts.day}`;
    }

    function formatDateTimeBR(value, options = {}) {
        if (!value) return options.fallback || '-';
        const localMatch = getLocalDateTimeMatch(value);
        if (localMatch) {
            const [, year, month, day, hour = '00', minute = '00', second = '00'] = localMatch;
            return `${day}/${month}/${options.shortYear ? year.slice(2) : year} ${hour}:${minute}${options.withSeconds ? `:${second}` : ''}`;
        }

        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return options.fallback || String(value);

        return date.toLocaleString(BR_LOCALE, {
            timeZone: BR_TIME_ZONE,
            day: '2-digit',
            month: '2-digit',
            year: options.shortYear ? '2-digit' : 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            ...(options.withSeconds ? { second: '2-digit' } : {})
        });
    }

    function formatDateBR(value, options = {}) {
        if (!value) return options.fallback || '-';
        const localMatch = getLocalDateTimeMatch(value);
        if (localMatch) {
            const [, year, month, day] = localMatch;
            return `${day}/${month}/${options.shortYear ? year.slice(2) : year}`;
        }

        const date = value instanceof Date ? value : new Date(String(value).includes('T') ? value : `${value}T00:00:00`);
        if (Number.isNaN(date.getTime())) return options.fallback || String(value);

        return date.toLocaleDateString(BR_LOCALE, {
            timeZone: BR_TIME_ZONE,
            day: '2-digit',
            month: '2-digit',
            year: options.shortYear ? '2-digit' : 'numeric'
        });
    }

    function formatTimeBR(value = new Date(), options = {}) {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return options.fallback || '-';

        return date.toLocaleTimeString(BR_LOCALE, {
            timeZone: BR_TIME_ZONE,
            hour: '2-digit',
            minute: '2-digit',
            ...(options.withSeconds ? { second: '2-digit' } : {})
        });
    }

    window.BR_TIME_ZONE = BR_TIME_ZONE;
    window.getDataHoraBrasil = getDataHoraBrasil;
    window.getDataBrasilISO = getDataBrasilISO;
    window.formatDateTimeBR = formatDateTimeBR;
    window.formatDateBR = formatDateBR;
    window.formatTimeBR = formatTimeBR;
})();
