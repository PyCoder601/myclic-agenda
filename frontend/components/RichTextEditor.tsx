'use client';

import { useEditor, EditorContent, FloatingMenu, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, Pilcrow, List, ListOrdered, Undo, Redo } from 'lucide-react';

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) {
    return null;
  }

  const menuItems = [
    { action: () => editor.chain().focus().toggleBold().run(), icon: Bold, name: 'Bold', isActive: editor.isActive('bold') },
    { action: () => editor.chain().focus().toggleItalic().run(), icon: Italic, name: 'Italic', isActive: editor.isActive('italic') },
    { action: () => editor.chain().focus().toggleUnderline().run(), icon: UnderlineIcon, name: 'Underline', isActive: editor.isActive('underline') },
    { action: () => editor.chain().focus().toggleStrike().run(), icon: Strikethrough, name: 'Strike', isActive: editor.isActive('strike') },
    { action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), icon: Pilcrow, name: 'Heading', isActive: editor.isActive('heading', { level: 2 }) },
    { action: () => editor.chain().focus().toggleBulletList().run(), icon: List, name: 'Bullet List', isActive: editor.isActive('bulletList') },
    { action: () => editor.chain().focus().toggleOrderedList().run(), icon: ListOrdered, name: 'Ordered List', isActive: editor.isActive('orderedList') },
    { action: () => editor.chain().focus().undo().run(), icon: Undo, name: 'Undo' },
    { action: () => editor.chain().focus().redo().run(), icon: Redo, name: 'Redo' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-slate-200 bg-slate-50/50 rounded-t-xl">
      {menuItems.map(item => (
        <button
          key={item.name}
          onClick={item.action}
          type="button"
          className={`p-2 rounded-lg transition-all duration-200 hover:bg-slate-200 ${item.isActive ? 'bg-slate-200 text-[#005f82]' : 'text-slate-600'}`}
          title={item.name}
        >
          <item.icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
};

const RichTextEditor = ({ content, onChange }: { content: string; onChange: (newContent: string) => void; }) => {
  const editor = useEditor({
    immediatelyRender: false, // Add this line
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3, 4],
        },
      }),
      Underline,
    ],
    content: content,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm lg:prose-base focus:outline-none p-4 min-h-[150px]',
      },
    },
  });

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm">
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
};

export default RichTextEditor;
