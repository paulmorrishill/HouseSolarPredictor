using System.Text;

namespace HouseSolarPredictor;

public class TablePrinter<T>
{
    private readonly List<ColumnConfig<T>> _columns = new();
    private readonly List<FooterRowConfig<T>> _footerRows = new();

    public TablePrinter<T> AddColumn(string header, Func<T, string> valueSelector)
    {
        _columns.Add(new ColumnConfig<T>(header, valueSelector));
        return this;
    }

    public TablePrinter<T> AddColumn(string header, Func<T, CellContent> valueSelector)
    {
        _columns.Add(new ColumnConfig<T>(header, valueSelector));
        return this;
    }

    public TablePrinter<T> AddFooterRow(Func<IEnumerable<T>, IEnumerable<string>> footerRowSelector)
    {
        _footerRows.Add(new FooterRowConfig<T>(footerRowSelector));
        return this;
    }

    public TablePrinter<T> AddFooterRow(Func<IEnumerable<T>, IEnumerable<CellContent>> footerRowSelector)
    {
        _footerRows.Add(new FooterRowConfig<T>(footerRowSelector));
        return this;
    }

    public void Print(IEnumerable<T> data)
    {
        var dataList = data.ToList();
        
        if (!dataList.Any())
        {
            Console.WriteLine("No data to display.");
            return;
        }

        CalculateColumnWidths(dataList);
        
        PrintHeader();
        PrintDataRows(dataList);
        
        if (_footerRows.Any())
        {
            PrintFooterRows(dataList);
        }
    }

    public void PrintToHtml(IEnumerable<T> data, string filePath, string? tableTitle = null, string? cssStyles = null)
    {
        var dataList = data.ToList();
        
        if (!dataList.Any())
        {
            File.WriteAllText(filePath, GenerateEmptyHtml(tableTitle, cssStyles));
            return;
        }

        var html = GenerateHtml(dataList, tableTitle, cssStyles);
        File.WriteAllText(filePath, html);
    }

    public string GenerateHtml(IEnumerable<T> data, string? tableTitle = null, string? cssStyles = null)
    {
        var dataList = data.ToList();
        
        if (!dataList.Any())
        {
            return GenerateEmptyHtml(tableTitle, cssStyles);
        }

        var html = new StringBuilder();
        
        html.AppendLine("<!DOCTYPE html>");
        html.AppendLine("<html lang=\"en\">");
        html.AppendLine("<head>");
        html.AppendLine("    <meta charset=\"UTF-8\">");
        html.AppendLine("    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">");
        html.AppendLine($"    <title>{tableTitle ?? "Table Report"}</title>");
        html.AppendLine("    <style>");
        html.AppendLine(cssStyles ?? GetDefaultCss());
        html.AppendLine("    </style>");
        html.AppendLine("</head>");
        html.AppendLine("<body>");
        
        if (!string.IsNullOrEmpty(tableTitle))
        {
            html.AppendLine($"    <h1>{System.Web.HttpUtility.HtmlEncode(tableTitle)}</h1>");
        }
        
        html.AppendLine("    <table>");
        
        // Header
        html.AppendLine("        <thead>");
        html.AppendLine("            <tr>");
        foreach (var column in _columns)
        {
            html.AppendLine($"                <th>{System.Web.HttpUtility.HtmlEncode(column.Header)}</th>");
        }
        html.AppendLine("            </tr>");
        html.AppendLine("        </thead>");
        
        // Body
        html.AppendLine("        <tbody>");
        foreach (var item in dataList)
        {
            html.AppendLine("            <tr>");
            foreach (var column in _columns)
            {
                var cellContent = column.GetCellContent(item);
                var styleAttr = !string.IsNullOrEmpty(cellContent.BackgroundColor) || !string.IsNullOrEmpty(cellContent.TextColor)
                    ? $" style=\"{GetCellStyle(cellContent)}\""
                    : "";
                html.AppendLine($"                <td{styleAttr}>{System.Web.HttpUtility.HtmlEncode(cellContent.Text)}</td>");
            }
            html.AppendLine("            </tr>");
        }
        html.AppendLine("        </tbody>");
        
        // Footer
        if (_footerRows.Any())
        {
            html.AppendLine("        <tfoot>");
            foreach (var footerRow in _footerRows)
            {
                html.AppendLine("            <tr>");
                var footerValues = footerRow.GetFooterContent(dataList).ToList();
                
                for (int i = 0; i < _columns.Count; i++)
                {
                    var cellContent = i < footerValues.Count ? footerValues[i] : new CellContent("");
                    var styleAttr = !string.IsNullOrEmpty(cellContent.BackgroundColor) || !string.IsNullOrEmpty(cellContent.TextColor)
                        ? $" style=\"{GetCellStyle(cellContent)}\""
                        : "";
                    html.AppendLine($"                <td{styleAttr}>{System.Web.HttpUtility.HtmlEncode(cellContent.Text)}</td>");
                }
                html.AppendLine("            </tr>");
            }
            html.AppendLine("        </tfoot>");
        }
        
        html.AppendLine("    </table>");
        html.AppendLine("</body>");
        html.AppendLine("</html>");
        
        return html.ToString();
    }

    private string GetCellStyle(CellContent cellContent)
    {
        var styles = new List<string>();
        
        if (!string.IsNullOrEmpty(cellContent.BackgroundColor))
        {
            styles.Add($"background-color: {cellContent.BackgroundColor}");
        }
        
        if (!string.IsNullOrEmpty(cellContent.TextColor))
        {
            styles.Add($"color: {cellContent.TextColor}");
        }
        
        return string.Join("; ", styles);
    }

    private string GetDefaultCss()
    {
        return @"
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }
        
        h1 {
            color: #333;
            text-align: center;
        }
        
        table {
            border-collapse: collapse;
            width: 100%;
            background-color: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        th, td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        
        th {
            background-color: #f8f9fa;
            font-weight: bold;
            color: #333;
        }
        
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        
        tr:hover {
            background-color: #f0f0f0;
        }
        
        tfoot tr {
            background-color: #e9ecef;
            font-weight: bold;
        }
        
        tfoot tr:hover {
            background-color: #dee2e6;
        }";
    }

    private string GenerateEmptyHtml(string? tableTitle, string? cssStyles)
    {
        return $@"<!DOCTYPE html>
<html lang=""en"">
<head>
    <meta charset=""UTF-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <title>{tableTitle ?? "Table Report"}</title>
    <style>
{cssStyles ?? GetDefaultCss()}
    </style>
</head>
<body>
    {(!string.IsNullOrEmpty(tableTitle) ? $"<h1>{System.Web.HttpUtility.HtmlEncode(tableTitle)}</h1>" : "")}
    <p>No data to display.</p>
</body>
</html>";
    }

    private void CalculateColumnWidths(IList<T> data)
    {
        foreach (var column in _columns)
        {
            // Start with header width
            column.Width = column.Header.Length;
            
            // Check all data rows
            foreach (var item in data)
            {
                var cellContent = column.GetCellContent(item);
                column.Width = Math.Max(column.Width, cellContent.Text.Length);
            }

            // Check footer rows
            foreach (var footerRow in _footerRows)
            {
                var footerValues = footerRow.GetFooterContent(data).ToList();
                for (int i = 0; i < Math.Min(footerValues.Count, _columns.Count); i++)
                {
                    if (i == _columns.IndexOf(column))
                    {
                        column.Width = Math.Max(column.Width, footerValues[i].Text.Length);
                    }
                }
            }
            
            // Add padding
            column.Width += 2;
        }
    }

    private void PrintHeader()
    {
        PrintSeparator();
        PrintRow(_columns.Select(c => c.Header));
        PrintSeparator();
    }

    private void PrintDataRows(IEnumerable<T> data)
    {
        foreach (var item in data)
        {
            PrintRow(_columns.Select(c => c.GetCellContent(item).Text));
        }
    }

    private void PrintFooterRows(IEnumerable<T> data)
    {
        PrintSeparator();
        
        foreach (var footerRow in _footerRows)
        {
            var footerValues = footerRow.GetFooterContent(data).ToList();
            
            // Pad the footer values to match column count
            var paddedValues = new List<string>();
            for (int i = 0; i < _columns.Count; i++)
            {
                paddedValues.Add(i < footerValues.Count ? footerValues[i].Text : "");
            }
            
            PrintRow(paddedValues);
        }
        
        PrintSeparator();
    }

    private void PrintSeparator()
    {
        var separator = string.Join("+", _columns.Select(c => new string('-', c.Width + 2)));
        Console.WriteLine("+" + separator + "+");
    }

    private void PrintRow(IEnumerable<string> values)
    {
        var cells = _columns.Zip(values, (col, val) => $" {val.PadRight(col.Width)} ");
        Console.WriteLine("|" + string.Join("|", cells) + "|");
    }

    private class ColumnConfig<TItem>
    {
        public string Header { get; }
        private readonly Func<TItem, string>? _stringValueSelector;
        private readonly Func<TItem, CellContent>? _cellContentSelector;
        public int Width { get; set; }

        public ColumnConfig(string header, Func<TItem, string> valueSelector)
        {
            Header = header;
            _stringValueSelector = valueSelector;
            Width = header.Length;
        }

        public ColumnConfig(string header, Func<TItem, CellContent> valueSelector)
        {
            Header = header;
            _cellContentSelector = valueSelector;
            Width = header.Length;
        }

        public CellContent GetCellContent(TItem item)
        {
            if (_cellContentSelector != null)
            {
                return _cellContentSelector(item);
            }
            
            if (_stringValueSelector != null)
            {
                return new CellContent(_stringValueSelector(item));
            }
            
            return new CellContent("");
        }
    }

    private class FooterRowConfig<TItem>
    {
        private readonly Func<IEnumerable<TItem>, IEnumerable<string>>? _stringFooterRowSelector;
        private readonly Func<IEnumerable<TItem>, IEnumerable<CellContent>>? _cellContentFooterRowSelector;

        public FooterRowConfig(Func<IEnumerable<TItem>, IEnumerable<string>> footerRowSelector)
        {
            _stringFooterRowSelector = footerRowSelector;
        }

        public FooterRowConfig(Func<IEnumerable<TItem>, IEnumerable<CellContent>> footerRowSelector)
        {
            _cellContentFooterRowSelector = footerRowSelector;
        }

        public IEnumerable<CellContent> GetFooterContent(IEnumerable<TItem> data)
        {
            if (_cellContentFooterRowSelector != null)
            {
                return _cellContentFooterRowSelector(data);
            }
            
            if (_stringFooterRowSelector != null)
            {
                return _stringFooterRowSelector(data).Select(s => new CellContent(s));
            }
            
            return Enumerable.Empty<CellContent>();
        }
    }
}

public class CellContent
{
    public string Text { get; }
    public string? BackgroundColor { get; }
    public string? TextColor { get; }

    public CellContent(string text, string? backgroundColor = null, string? textColor = null)
    {
        Text = text ?? "";
        BackgroundColor = backgroundColor;
        TextColor = textColor;
    }

    // Implicit conversion from string for backward compatibility
    public static implicit operator CellContent(string text)
    {
        return new CellContent(text);
    }

    // Helper methods for common colors
    public static CellContent WithBackground(string text, string backgroundColor)
    {
        return new CellContent(text, backgroundColor);
    }

    public static CellContent WithTextColor(string text, string textColor)
    {
        return new CellContent(text, null, textColor);
    }

    public static CellContent WithColors(string text, string backgroundColor, string textColor)
    {
        return new CellContent(text, backgroundColor, textColor);
    }

    // Common color constants
    public static class Colors
    {
        public const string Red = "#ffebee";
        public const string Green = "#e8f5e8";
        public const string Yellow = "#fff8e1";
        public const string Blue = "#e3f2fd";
        public const string Orange = "#fff3e0";
        public const string Purple = "#f3e5f5";
        public const string Gray = "#f5f5f5";
        
        public const string DarkRed = "#d32f2f";
        public const string DarkGreen = "#388e3c";
        public const string DarkBlue = "#1976d2";
        public const string DarkOrange = "#f57c00";
        public const string DarkPurple = "#7b1fa2";
        public const string DarkGray = "#616161";
    }
}