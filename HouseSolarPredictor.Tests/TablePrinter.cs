using System;
using System.Collections.Generic;
using System.Linq;

public class TablePrinter<T>
{
    private readonly List<ColumnConfig<T>> _columns = new();
    private readonly List<FooterRowConfig<T>> _footerRows = new();

    public TablePrinter<T> AddColumn(string header, Func<T, string> valueSelector)
    {
        _columns.Add(new ColumnConfig<T>(header, valueSelector));
        return this;
    }

    public TablePrinter<T> AddFooterRow(Func<IEnumerable<T>, IEnumerable<string>> footerRowSelector)
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

    private void CalculateColumnWidths(IList<T> data)
    {
        foreach (var column in _columns)
        {
            // Start with header width
            column.Width = column.Header.Length;
            
            // Check all data rows
            foreach (var item in data)
            {
                var cellValue = column.ValueSelector(item);
                column.Width = Math.Max(column.Width, cellValue.Length);
            }

            // Check footer rows
            foreach (var footerRow in _footerRows)
            {
                var footerValues = footerRow.FooterRowSelector(data).ToList();
                for (int i = 0; i < Math.Min(footerValues.Count, _columns.Count); i++)
                {
                    if (i == _columns.IndexOf(column))
                    {
                        column.Width = Math.Max(column.Width, footerValues[i].Length);
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
            PrintRow(_columns.Select(c => c.ValueSelector(item)));
        }
    }

    private void PrintFooterRows(IEnumerable<T> data)
    {
        PrintSeparator();
        
        foreach (var footerRow in _footerRows)
        {
            var footerValues = footerRow.FooterRowSelector(data).ToList();
            
            // Pad the footer values to match column count
            var paddedValues = new List<string>();
            for (int i = 0; i < _columns.Count; i++)
            {
                paddedValues.Add(i < footerValues.Count ? footerValues[i] : "");
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
        public Func<TItem, string> ValueSelector { get; }
        public int Width { get; set; }

        public ColumnConfig(string header, Func<TItem, string> valueSelector)
        {
            Header = header;
            ValueSelector = valueSelector;
            Width = header.Length;
        }
    }

    private class FooterRowConfig<TItem>
    {
        public Func<IEnumerable<TItem>, IEnumerable<string>> FooterRowSelector { get; }

        public FooterRowConfig(Func<IEnumerable<TItem>, IEnumerable<string>> footerRowSelector)
        {
            FooterRowSelector = footerRowSelector;
        }
    }
}