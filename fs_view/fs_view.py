import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import platform
import time

class FileBrowser(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Navegador de Arquivos")
        self.geometry("800x500")
        self.tree = ttk.Treeview(self, columns=("#1", "#2", "#3", "#4"), show="tree headings")
        self.tree.heading("#0", text="Nome")
        self.tree.heading("#1", text="Tipo")
        self.tree.heading("#2", text="Tamanho")
        self.tree.heading("#3", text="Modificado em")
        self.tree.heading("#4", text="Permissões")
        self.tree.pack(fill=tk.BOTH, expand=True)
        self.tree.bind("<Double-1>", self.on_double_click)
        self.current_path = os.path.expanduser("~")
        self.menu = tk.Menu(self, tearoff=0)
        self.menu.add_command(label="Abrir", command=self.open_selected)
        self.menu.add_command(label="Voltar", command=self.go_up)
        self.tree.bind("<Button-3>", self.show_context_menu)
        self.populate_tree(self.current_path)

    def populate_tree(self, path):
        self.tree.delete(*self.tree.get_children())
        self.current_path = path
        try:
            entries = os.listdir(path)
        except Exception as e:
            messagebox.showerror("Erro", str(e))
            return
        # Adiciona pasta para voltar
        if os.path.dirname(path) != path:
            self.tree.insert('', 'end', text="[..]", values=("Pasta", "-", "-", "-"), tags=("up",))
        for entry in sorted(entries):
            full_path = os.path.join(path, entry)
            try:
                stat = os.stat(full_path)
                is_dir = os.path.isdir(full_path)
                tipo = "Pasta" if is_dir else "Arquivo"
                tamanho = stat.st_size if not is_dir else "-"
                modificado = time.strftime('%Y-%m-%d %H:%M', time.localtime(stat.st_mtime))
                permissoes = oct(stat.st_mode)[-3:]
                self.tree.insert('', 'end', text=entry, values=(tipo, tamanho, modificado, permissoes), tags=("dir" if is_dir else "file",))
            except Exception as e:
                self.tree.insert('', 'end', text=entry, values=("Erro", "-", "-", "-"))

    def on_double_click(self, event):
        item = self.tree.selection()
        if not item:
            return
        nome = self.tree.item(item, "text")
        if nome == "[..]":
            self.go_up()
            return
        full_path = os.path.join(self.current_path, nome)
        if os.path.isdir(full_path):
            self.populate_tree(full_path)
        else:
            self.show_file_info(full_path)

    def go_up(self):
        parent = os.path.dirname(self.current_path)
        if parent != self.current_path:
            self.populate_tree(parent)

    def show_file_info(self, path):
        try:
            stat = os.stat(path)
            info = f"Arquivo: {os.path.basename(path)}\n"
            info += f"Tamanho: {stat.st_size} bytes\n"
            info += f"Modificado em: {time.strftime('%Y-%m-%d %H:%M', time.localtime(stat.st_mtime))}\n"
            info += f"Permissões: {oct(stat.st_mode)[-3:]}\n"
            info += f"Caminho completo: {path}"
            messagebox.showinfo("Informações do Arquivo", info)
        except Exception as e:
            messagebox.showerror("Erro", str(e))

    def show_context_menu(self, event):
        try:
            self.menu.tk_popup(event.x_root, event.y_root)
        finally:
            self.menu.grab_release()

    def open_selected(self):
        item = self.tree.selection()
        if not item:
            return
        nome = self.tree.item(item, "text")
        if nome == "[..]":
            self.go_up()
            return
        full_path = os.path.join(self.current_path, nome)
        if os.path.isdir(full_path):
            self.populate_tree(full_path)
        else:
            self.show_file_info(full_path)

if __name__ == "__main__":
    app = FileBrowser()
    app.mainloop()
