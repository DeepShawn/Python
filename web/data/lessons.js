// Python Nexus 课程数据（8 个阶段）。
// 课时结构：知识讲解 → 可执行示例 → 运行过程动画 → 练习 → 自动评测。
// 字段：id、title、body（HTML）、code、files（附带的项目文件，可选）、practice（配套题目 id，可选）、
//       testInput（可选：仅供自动测试运行示例时模拟键盘输入；界面中的 input() 在 Shell 里实时输入）。

export const COURSE = [
  // ======================================================================== 零基础
  {
    stage: "零基础", hours: 20,
    topics: ["print 输出", "input 输入", "变量", "数据类型", "类型转换", "注释"],
    lessons: [
      {
        id: "l-print", title: "第一个程序：print()",
        body: `
<p><code>print()</code> 是 Python 的内置函数，用来把内容输出到控制台。文字（字符串）要放在引号里，数字不需要。</p>
<ul>
  <li>多个值用逗号分隔，输出时自动以空格隔开；</li>
  <li><code>sep=</code> 改变分隔符，<code>end=</code> 改变结尾（默认换行）。</li>
</ul>
<p>点击「可视化运行」，观察每一行如何依次执行，输出如何逐步出现在控制台。</p>`,
        code: `print("Hello, World!")
print("我今年", 18, "岁")
print("A", "B", "C", sep="-")
print("不换行", end=" → ")
print("继续")`,
        practice: "q-print-1",
      },
      {
        id: "l-comment", title: "注释与代码风格",
        body: `
<p><code>#</code> 后面的内容是注释，Python 不会执行它。注释用来解释<strong>为什么</strong>这样写。</p>
<p>Python 社区的代码风格规范叫 PEP 8：变量名用小写加下划线（<code>total_price</code>），运算符两边加空格，每级缩进 4 个空格。</p>
<p>在编辑器中按 <kbd>Ctrl</kbd>+<kbd>/</kbd> 可以快速注释或取消注释选中的行。</p>`,
        code: `# 计算长方形的面积
width = 8      # 宽，单位：米
height = 5     # 高，单位：米

area = width * height
print("面积是", area, "平方米")

# print("这一行被注释掉了，不会执行")`,
      },
      {
        id: "l-vars", title: "变量与赋值",
        body: `
<p>变量是数据的名字。<code>=</code> 表示「把右边的值赋给左边的名字」，不是数学中的相等。</p>
<p>运行下面的程序，在右侧「变量」面板中观察 <code>x</code>、<code>y</code>、<code>z</code> 被逐个创建，以及 <code>x</code> 被重新赋值时的变化。</p>`,
        code: `x = 3
y = 5
z = x + y
print(z)
x = x * 10
print(x, y, z)
a, b = 1, 2      # 同时给多个变量赋值
a, b = b, a      # 交换两个变量
print(a, b)`,
      },
      {
        id: "l-types", title: "数据类型：int、float、str、bool",
        body: `
<p>每个值都有类型，用 <code>type()</code> 查看：</p>
<ul>
  <li><code>int</code> 整数，<code>float</code> 小数（浮点数）；</li>
  <li><code>str</code> 字符串（文字），<code>bool</code> 布尔值 <code>True</code> / <code>False</code>。</li>
</ul>
<p>注意：<code>0.1 + 0.2</code> 不精确等于 <code>0.3</code>，这是浮点数在计算机中的表示方式决定的。</p>`,
        code: `print(type(42), type(3.14), type("hi"), type(True))
print(7 / 2)    # 除法结果总是 float
print(7 // 2)   # 整除
print(7 % 2)    # 取余数
print(2 ** 10)  # 乘方
print(0.1 + 0.2)
print(round(0.1 + 0.2, 2))`,
        practice: "q-type-1",
      },
      {
        id: "l-input", title: "input() 与类型转换",
        body: `
<p><code>input()</code> 读取用户输入，结果<strong>永远是字符串</strong>。做数学运算前需要用 <code>int()</code> 或 <code>float()</code> 转换。</p>
<p>运行后程序会在底部的 <strong>Shell</strong> 中停下来等待输入：直接在提示语后面输入并回车，就像 Python 自带的 IDLE 一样。程序结束后，还可以在 <code>&gt;&gt;&gt;</code> 后继续输入 <code>name</code>、<code>age</code> 查看变量。</p>`,
        code: `name = input("你的名字: ")
age = int(input("你的年龄: "))
print(name, "明年", age + 1, "岁")
print(type(age))`,
        testInput: "小明\n17",
        practice: "p-hello",
      },
      {
        id: "l-fstring", title: "字符串格式化：f-string",
        body: `
<p>在字符串前加 <code>f</code>，就可以在 <code>{}</code> 中直接写变量和表达式。</p>
<p><code>{x:.2f}</code> 保留两位小数，<code>{n:>5}</code> 右对齐占 5 格，<code>{n:,}</code> 加千位分隔符。</p>`,
        code: `name = "Nexus"
price = 1234.5
count = 3
print(f"你好，{name}！")
print(f"单价 {price:.2f} 元，共 {count} 件，合计 {price * count:,.2f} 元")
for n in [7, 42, 365]:
    print(f"[{n:>5}]")`,
        practice: "rf-arith",
      },
    ],
  },

  // ======================================================================== 基础语法
  {
    stage: "基础语法", hours: 35,
    topics: ["运算符", "条件判断", "循环", "字符串", "列表 / 元组 / 字典 / 集合"],
    lessons: [
      {
        id: "l-operators", title: "比较与逻辑运算符",
        body: `
<p>比较运算符（<code>==</code>、<code>!=</code>、<code>&lt;</code>、<code>&gt;=</code> 等）的结果是布尔值。<code>and</code>、<code>or</code>、<code>not</code> 组合多个条件。</p>
<p>Python 支持链式比较：<code>0 &lt;= x &lt; 10</code>。</p>`,
        code: `x = 7
print(x > 5, x == 7, x != 7)
print(x > 5 and x < 10)
print(x < 0 or x > 100)
print(not x > 5)
print(0 <= x < 10)`,
      },
      {
        id: "l-if", title: "条件判断 if / elif / else",
        body: `
<p><code>if</code> 根据条件选择执行哪一段代码。冒号后面的代码块必须<strong>缩进</strong>（通常 4 个空格）。</p>
<p>点击「流程图」查看这段代码自动生成的控制流程图，再用「可视化运行」观察实际走了哪一条分支。多运行几次，在 Shell 中输入不同的数字试试。</p>`,
        code: `n = int(input("n: "))
if n % 2 == 0:
    print("偶数")
else:
    print("奇数")`,
        testInput: "7",
        practice: "p-parity",
      },
      {
        id: "l-elif", title: "多分支：成绩等级",
        body: `
<p>多个条件依次判断时使用 <code>elif</code>。一旦某个条件成立，后面的分支都不再检查——在流程图中可以清楚看到这条「判断链」。</p>`,
        code: `score = int(input("成绩: "))
if score >= 90:
    grade = "A"
elif score >= 80:
    grade = "B"
elif score >= 60:
    grade = "C"
else:
    grade = "D"
print(f"{score} 分，等级 {grade}")`,
        testInput: "85",
        practice: "p-max3",
      },
      {
        id: "l-loop", title: "for 与 while 循环",
        body: `
<p><code>for</code> 遍历一个序列，<code>while</code> 在条件为真时重复执行。<code>range(a, b)</code> 生成从 a 到 b-1 的整数。</p>
<p>可视化运行时注意：循环头所在的行会被反复执行，这正是执行追踪器按<em>真实执行顺序</em>回放的效果。</p>`,
        code: `total = 0
for i in range(1, 6):
    total += i
print("1 到 5 的和:", total)

n = 3
while n > 0:
    print("倒计时", n)
    n -= 1
print("发射！")`,
        practice: "fl-while-sum",
      },
      {
        id: "l-break", title: "break、continue 与循环的 else",
        body: `
<p><code>break</code> 立即跳出循环，<code>continue</code> 跳过本轮剩下的代码。循环正常结束（没有被 break）时，会执行 <code>else</code> 分支——常用于「查找失败」的情况。</p>`,
        code: `for n in range(2, 20):
    if n % 2 == 0:
        continue          # 跳过偶数
    for d in range(3, n):
        if n % d == 0:
            break         # 找到因数，不是质数
    else:
        print(n, "是质数")`,
        practice: "cf-even-sum",
      },
      {
        id: "l-string", title: "字符串操作",
        body: `
<p>字符串可以用下标访问（从 0 开始，-1 表示最后一个）、切片 <code>s[a:b]</code>，以及调用各种方法。字符串是<strong>不可变</strong>的：方法返回新字符串。</p>`,
        code: `s = "Hello, Python Nexus"
print(s[0], s[-1], s[7:13])
print(s.lower(), s.upper())
print(s.split(", "))
print(s.replace("Python", "Py"))
print("Nexus" in s, s.find("Py"), len(s))
print("-".join(["2026", "11", "06"]))
print(s[::-1])  # 反转`,
        practice: "rf-slice",
      },
      {
        id: "l-list", title: "列表与元组",
        body: `
<p>列表 <code>[]</code> 是有序、可修改的序列；元组 <code>()</code> 有序但不可修改，常用于表示一组固定的数据。</p>`,
        code: `fruits = ["苹果", "香蕉"]
fruits.append("橙子")
fruits.insert(0, "葡萄")
print(fruits, len(fruits))
fruits.remove("香蕉")
print(fruits.pop(), fruits)
nums = [5, 2, 9, 1]
nums.sort()
print(nums, max(nums), sum(nums))
point = (3, 4)
x, y = point     # 元组解包
print(x, y)`,
        practice: "q-container-1",
      },
      {
        id: "l-dict", title: "字典与集合",
        body: `
<p>字典 <code>{键: 值}</code> 通过键快速查找值；集合 <code>{a, b}</code> 自动去重，支持交集 <code>&amp;</code>、并集 <code>|</code>、差集 <code>-</code>。</p>`,
        code: `scores = {"小明": 90, "小红": 95}
scores["小刚"] = 78
print(scores.get("小李", "没有记录"))
for name, s in scores.items():
    print(name, s)

a = {1, 2, 3, 3}
b = {2, 3, 4}
print(a, a & b, a | b, a - b)`,
        practice: "p-word-count",
      },
      {
        id: "l-comprehension", title: "列表推导式",
        body: `
<p>推导式用一行代码根据已有序列生成新序列：<code>[表达式 for 变量 in 序列 if 条件]</code>。字典和集合也有对应的推导式。</p>`,
        code: `nums = range(1, 11)
squares = [n * n for n in nums]
evens = [n for n in nums if n % 2 == 0]
lengths = {w: len(w) for w in ["py", "nexus", "ide"]}
print(squares)
print(evens)
print(lengths)`,
      },
    ],
  },

  // ======================================================================== 函数编程
  {
    stage: "函数编程", hours: 25,
    topics: ["函数定义", "参数与返回值", "作用域", "递归", "异常处理", "lambda"],
    lessons: [
      {
        id: "l-func", title: "定义函数",
        body: `
<p><code>def</code> 定义函数，<code>return</code> 返回结果。函数内部创建的变量是<strong>局部变量</strong>。</p>
<p>可视化运行时，右侧「调用栈」会显示每次进入和离开函数。</p>`,
        code: `def greet(name):
    message = f"Hello, {name}!"
    return message

print(greet("World"))
print(greet("Python"))`,
        practice: "q-scope-1",
      },
      {
        id: "l-params", title: "参数：默认值、关键字参数、*args",
        body: `
<p>参数可以有默认值；调用时可以按名字传参；<code>*args</code> 接收任意多个位置参数，<code>**kwargs</code> 接收任意多个关键字参数。</p>`,
        code: `def power(base, exp=2):
    return base ** exp

print(power(3), power(2, 10), power(exp=3, base=2))

def total(*nums):
    return sum(nums)

def describe(**info):
    for k, v in info.items():
        print(f"{k} = {v}")

print(total(1, 2, 3, 4))
describe(name="Nexus", version=1)`,
        practice: "q-default-arg",
      },
      {
        id: "l-scope", title: "作用域与 global",
        body: `
<p>函数内赋值的变量默认是局部的。要修改全局变量需要声明 <code>global</code>——但更好的做法是通过参数和返回值传递数据。</p>`,
        code: `count = 0

def add_bad():
    count = 100      # 这是新的局部变量
    return count

def add_global():
    global count
    count += 1

add_bad()
add_global()
add_global()
print(count)`,
      },
      {
        id: "l-recursion", title: "递归",
        body: `
<p>函数调用自己叫做递归。递归必须有<strong>终止条件</strong>，否则会无限调用。</p>
<p>观察调用栈如何一层层加深，再在遇到 <code>return</code> 后逐层返回。</p>`,
        code: `def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)

print(fact(4))`,
        practice: "rec-fib",
      },
      {
        id: "l-except", title: "异常处理 try / except",
        body: `
<p>程序出错时会抛出异常。用 <code>try / except</code> 捕获它，让程序继续运行；<code>finally</code> 中的代码无论是否出错都会执行。</p>`,
        code: `def safe_div(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        print("除数不能为 0")
        return None
    finally:
        print("计算结束")

print(safe_div(6, 3))
print(safe_div(1, 0))`,
        practice: "p-safe-int",
      },
      {
        id: "l-raise", title: "抛出异常与自定义异常",
        body: `
<p>用 <code>raise</code> 主动报告错误。继承 <code>Exception</code> 可以定义自己的异常类型，让调用者精确地捕获。</p>`,
        code: `class AgeError(ValueError):
    pass

def check_age(age):
    if age < 0:
        raise AgeError(f"年龄不能为负数：{age}")
    return age

for a in [18, -3]:
    try:
        print("有效年龄", check_age(a))
    except AgeError as e:
        print("错误：", e)`,
      },
      {
        id: "l-lambda", title: "lambda 与高阶函数",
        body: `
<p><code>lambda 参数: 表达式</code> 定义匿名函数，常作为参数传给 <code>sorted</code>、<code>map</code>、<code>filter</code> 等高阶函数。</p>`,
        code: `students = [("小明", 90), ("小红", 95), ("小刚", 78)]
by_score = sorted(students, key=lambda s: s[1], reverse=True)
print(by_score)
print(list(map(lambda x: x * 2, [1, 2, 3])))
print(list(filter(lambda x: x % 2, range(10))))`,
        practice: "q-fill-lambda",
      },
    ],
  },

  // ======================================================================== 进阶编程
  {
    stage: "进阶编程", hours: 35,
    topics: ["文件读写", "模块与包", "面向对象", "继承", "迭代器与生成器", "装饰器"],
    lessons: [
      {
        id: "l-file", title: "文件读写",
        body: `
<p><code>open(路径, 模式)</code> 打开文件：<code>"w"</code> 写入、<code>"a"</code> 追加、<code>"r"</code> 读取。使用 <code>with</code> 语句会自动关闭文件。</p>
<p>网页版的文件保存在应用的虚拟文件系统（沙盒）中；Windows 版保存在项目目录。</p>`,
        code: `with open("notes.txt", "w", encoding="utf-8") as f:
    f.write("第一行\\n")
    f.write("第二行\\n")

with open("notes.txt", "a", encoding="utf-8") as f:
    f.write("追加的一行\\n")

with open("notes.txt", encoding="utf-8") as f:
    for i, line in enumerate(f, start=1):
        print(i, line.strip())`,
      },
      {
        id: "l-module", title: "模块化：多文件项目",
        body: `
<p>把函数放进独立的 <code>.py</code> 文件，再用 <code>import</code> 导入，就是模块化编程。</p>
<p>点击「在编辑器中打开」会创建 <code>calculator.py</code> 和它的单元测试，然后运行本文件。在「代码结构」面板中可以看到模块导入关系；点击「🧪 测试」运行测试。</p>`,
        code: `from calculator import add, mul

print(add(2, 3))
print(mul(4, 5))`,
        files: {
          "calculator.py": `def add(a, b):
    return a + b


def mul(a, b):
    return a * b
`,
          "tests/test_calculator.py": `import unittest
from calculator import add, mul


class TestCalculator(unittest.TestCase):
    def test_add(self):
        self.assertEqual(add(2, 3), 5)

    def test_mul(self):
        self.assertEqual(mul(4, 5), 20)
`,
        },
      },
      {
        id: "l-class", title: "类与对象",
        body: `<p><code>class</code> 定义类，<code>__init__</code> 初始化对象，<code>self</code> 指向对象本身。<code>__str__</code> 决定 <code>print</code> 时的显示。</p>`,
        code: `class Counter:
    def __init__(self, start=0):
        self.value = start

    def add(self, n=1):
        self.value += n
        return self.value

    def __str__(self):
        return f"Counter({self.value})"

c = Counter()
c.add()
c.add(5)
print(c)`,
        practice: "q-oop-self",
      },
      {
        id: "l-inherit", title: "继承与多态",
        body: `
<p>子类继承父类的属性和方法，可以<strong>重写</strong>方法。同一个调用 <code>shape.area()</code> 对不同对象有不同行为，这就是多态。</p>
<p>点击「流程图」后在「代码结构」面板查看自动生成的类继承关系。</p>`,
        code: `class Shape:
    def area(self):
        return 0

class Rect(Shape):
    def __init__(self, w, h):
        self.w, self.h = w, h
    def area(self):
        return self.w * self.h

class Circle(Shape):
    def __init__(self, r):
        self.r = r
    def area(self):
        return round(3.14159 * self.r ** 2, 2)

for shape in [Rect(3, 4), Circle(1)]:
    print(type(shape).__name__, shape.area())`,
        practice: "md-rect",
      },
      {
        id: "l-dataclass", title: "数据类 dataclass",
        body: `<p><code>@dataclass</code> 自动生成 <code>__init__</code>、<code>__repr__</code> 和比较方法，适合「只存数据」的类。</p>`,
        code: `from dataclasses import dataclass, field

@dataclass
class Student:
    name: str
    score: int = 0
    tags: list = field(default_factory=list)

a = Student("小明", 90)
b = Student("小明", 90)
print(a)
print(a == b)`,
      },
      {
        id: "l-generator", title: "迭代器与生成器",
        body: `<p>函数中使用 <code>yield</code> 就成为生成器：每次取值时才执行到下一个 <code>yield</code>，适合处理大量或无限的数据。可视化运行观察函数如何在 yield 处暂停与恢复。</p>`,
        code: `def countdown(n):
    while n > 0:
        yield n
        n -= 1

for x in countdown(3):
    print(x)

gen = (i * i for i in range(5))
print(next(gen), next(gen), list(gen))`,
        practice: "p-gen-evens",
      },
      {
        id: "l-decorator", title: "装饰器",
        body: `<p>装饰器是「接收函数、返回新函数」的函数，用 <code>@</code> 语法应用，可以在不修改原函数的情况下增加功能（如计时、日志、缓存）。</p>`,
        code: `import functools

def log_calls(func):
    @functools.wraps(func)
    def wrapper(*args):
        result = func(*args)
        print(f"{func.__name__}{args} -> {result}")
        return result
    return wrapper

@log_calls
def add(a, b):
    return a + b

add(1, 2)
add(10, 20)`,
      },
    ],
  },

  // ======================================================================== 标准库
  {
    stage: "标准库", hours: 35,
    topics: ["math", "random", "json", "datetime", "os / pathlib", "collections", "re 正则表达式", "csv"],
    lessons: [
      {
        id: "l-math-random", title: "math 与 random",
        body: `<p>标准库无需安装、离线可用。<code>math</code> 提供数学函数，<code>random</code> 生成随机数（设置 <code>seed</code> 后结果可复现）。</p>`,
        code: `import math
import random

print(math.sqrt(16), math.pi, math.gcd(12, 18), math.ceil(2.1))
random.seed(42)
print(random.randint(1, 6), random.choice(["石头", "剪刀", "布"]))
deck = list(range(1, 11))
random.shuffle(deck)
print(deck)`,
        practice: "rf-divmod",
      },
      {
        id: "l-json", title: "json 与 collections",
        body: `<p><code>json</code> 处理 JSON 文本，<code>collections.Counter</code> 统计次数，<code>defaultdict</code> 提供默认值。</p>`,
        code: `import json
from collections import Counter, defaultdict

text = '{"name": "Nexus", "tags": ["python", "offline", "python"]}'
data = json.loads(text)
print(data["name"])
print(Counter(data["tags"]).most_common(1))
groups = defaultdict(list)
for word in ["apple", "avocado", "banana"]:
    groups[word[0]].append(word)
print(dict(groups))
print(json.dumps(data, ensure_ascii=False, indent=2))`,
        practice: "p-top-word",
      },
      {
        id: "l-datetime", title: "datetime 日期与时间",
        body: `<p><code>datetime</code> 表示时间点，<code>timedelta</code> 表示时间间隔；<code>strftime</code> 格式化输出，<code>strptime</code> 解析字符串。</p>`,
        code: `from datetime import datetime, timedelta, date

d = datetime(2026, 11, 6, 9, 30)
print(d.strftime("%Y年%m月%d日 %H:%M"))
print(d + timedelta(days=30))
print(date(2026, 12, 31) - date(2026, 11, 6))
print(datetime.strptime("2026-01-15", "%Y-%m-%d").weekday())`,
      },
      {
        id: "l-pathlib", title: "os 与 pathlib：文件与目录",
        body: `<p><code>pathlib.Path</code> 用面向对象的方式处理路径：创建目录、遍历文件、读写文本。这是自动化脚本的基础。</p>`,
        code: `from pathlib import Path

root = Path("demo_files")
root.mkdir(exist_ok=True)
for name in ["a.txt", "b.txt", "c.log"]:
    (root / name).write_text(f"这是 {name}", encoding="utf-8")

for p in sorted(root.glob("*.txt")):
    print(p.name, p.suffix, p.stat().st_size, "字节")
print([p.name for p in root.iterdir()])`,
      },
      {
        id: "l-regex", title: "re 正则表达式",
        body: `<p>正则表达式描述文本的模式：<code>\\d</code> 数字、<code>\\w</code> 单词字符、<code>+</code> 一个或多个、<code>()</code> 分组。<code>re.findall</code> 找出所有匹配。</p>`,
        code: `import re

log = """2026-11-06 10:01 ERROR 磁盘空间不足
2026-11-06 10:05 INFO 备份完成
2026-11-06 11:20 ERROR 连接超时"""

errors = re.findall(r"(\\d{2}:\\d{2}) ERROR (.+)", log)
for time, msg in errors:
    print(time, msg)
print(re.sub(r"\\d{4}-\\d{2}-\\d{2}", "<日期>", log.splitlines()[0]))
print(bool(re.fullmatch(r"1[3-9]\\d{9}", "13812345678")))`,
      },
      {
        id: "l-csv", title: "csv 表格数据",
        body: `<p><code>csv</code> 模块读写逗号分隔的表格文件；<code>DictReader</code> 把每一行读成字典。</p>`,
        code: `import csv

rows = [["姓名", "科目", "成绩"], ["小明", "数学", 90], ["小红", "数学", 95], ["小明", "语文", 82]]
with open("scores.csv", "w", newline="", encoding="utf-8") as f:
    csv.writer(f).writerows(rows)

total = {}
with open("scores.csv", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        total[row["姓名"]] = total.get(row["姓名"], 0) + int(row["成绩"])
print(total)`,
      },
    ],
  },

  // ======================================================================== 算法与结构
  {
    stage: "算法与结构", hours: 40,
    topics: ["复杂度分析", "排序", "查找", "栈与队列", "递归与分治", "哈希表"],
    lessons: [
      {
        id: "l-complexity", title: "复杂度：为什么算法有快慢",
        body: `
<p>时间复杂度描述输入规模 n 变大时，执行步数如何增长：O(1) 常数、O(log n) 对数、O(n) 线性、O(n²) 平方。</p>
<p>下面的程序统计两种求和方法实际执行的循环次数。算法题会限制每个用例的<strong>执行行数</strong>，低效的算法会被判为超时。</p>`,
        code: `def sum_loop(n):
    steps, total = 0, 0
    for i in range(1, n + 1):
        total += i
        steps += 1
    return total, steps

def sum_formula(n):
    return n * (n + 1) // 2, 1

for n in [10, 1000, 100000]:
    print(n, sum_loop(n), sum_formula(n))`,
      },
      {
        id: "l-sort", title: "排序：冒泡与选择",
        body: `<p>冒泡排序反复比较相邻元素并交换，每一轮把最大的元素「冒」到末尾，复杂度 O(n²)。可视化运行观察 <code>data</code> 列表的变化。</p>`,
        code: `def bubble_sort(items):
    data = list(items)
    n = len(data)
    for i in range(n):
        swapped = False
        for j in range(n - 1 - i):
            if data[j] > data[j + 1]:
                data[j], data[j + 1] = data[j + 1], data[j]
                swapped = True
        if not swapped:
            break
    return data

print(bubble_sort([5, 1, 4, 2, 8]))`,
        practice: "p-bubble",
      },
      {
        id: "l-binsearch", title: "二分查找",
        body: `<p>在<strong>有序</strong>列表中查找，每次排除一半，时间复杂度 O(log n)。用可视化运行观察 <code>lo</code>、<code>hi</code>、<code>mid</code> 如何变化。</p>`,
        code: `def binary_search(items, target):
    lo, hi = 0, len(items) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if items[mid] == target:
            return mid
        elif items[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1

print(binary_search([1, 3, 5, 7, 9, 11], 9))`,
        practice: "p-binsearch",
      },
      {
        id: "l-stack-queue", title: "栈与队列",
        body: `<p>栈「后进先出」，用列表的 <code>append</code> / <code>pop</code> 实现；队列「先进先出」，用 <code>collections.deque</code> 实现。括号匹配是栈的经典应用。</p>`,
        code: `from collections import deque

stack = []
for ch in "abc":
    stack.append(ch)
print("出栈顺序:", [stack.pop() for _ in range(3)])

queue = deque(["小明", "小红"])
queue.append("小刚")
print("先服务:", queue.popleft(), "剩余:", list(queue))`,
        practice: "p-brackets",
      },
      {
        id: "l-merge-sort", title: "分治：归并排序",
        body: `<p>分治把问题拆成更小的同类问题：归并排序先把列表一分为二分别排序，再合并两个有序列表，复杂度 O(n log n)。观察调用栈中递归的层次。</p>`,
        code: `def merge_sort(a):
    if len(a) <= 1:
        return a
    mid = len(a) // 2
    left, right = merge_sort(a[:mid]), merge_sort(a[mid:])
    merged, i, j = [], 0, 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            merged.append(left[i]); i += 1
        else:
            merged.append(right[j]); j += 1
    return merged + left[i:] + right[j:]

print(merge_sort([38, 27, 43, 3, 9, 82, 10]))`,
      },
      {
        id: "l-hash", title: "哈希表：用字典换时间",
        body: `<p>字典的查找平均是 O(1)。「两数之和」用双重循环是 O(n²)，用字典记录见过的数字可以降到 O(n)。</p>`,
        code: `def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return seen[target - x], i
        seen[x] = i

print(two_sum([2, 7, 11, 15], 9))
print(two_sum([3, 2, 4], 6))`,
        practice: "p-two-sum",
      },
    ],
  },

  // ======================================================================== 第三方库
  {
    stage: "第三方库", hours: 35,
    topics: ["NumPy 数组", "pandas 表格", "Matplotlib 绘图", "BeautifulSoup 网页解析"],
    note: "第三方库需随应用离线打包：网页版运行 npm run vendor -- --pyodide-packages numpy,pandas,matplotlib；Windows 版可在项目菜单中离线安装 .whl。",
    lessons: [
      {
        id: "l-bs4", title: "BeautifulSoup 解析 HTML",
        body: `<p>BeautifulSoup 把 HTML 解析成树，可以用 CSS 选择器 <code>select()</code> 查找元素。它是纯 Python 库，已随应用离线打包。</p>`,
        code: `from bs4 import BeautifulSoup

html = """
<ul id="menu">
  <li class="item"><a href="/a">Python 基础</a></li>
  <li class="item hot"><a href="/b">爬虫实战</a></li>
</ul>"""
soup = BeautifulSoup(html, "html.parser")
for li in soup.select("li.item"):
    a = li.find("a")
    print(a.text, a["href"], "热门" if "hot" in li["class"] else "")`,
      },
      {
        id: "l-numpy", title: "NumPy 数组运算",
        body: `<p>NumPy 的数组支持「向量化」运算：一次对整个数组计算，比 Python 循环快得多。</p>`,
        code: `import numpy as np

a = np.arange(1, 11)
print(a, a.dtype)
print(a * 2, a.sum(), a.mean())
m = a.reshape(2, 5)
print(m)
print(m.T.shape, m[:, 0])`,
      },
      {
        id: "l-pandas", title: "pandas 表格分析",
        body: `<p>pandas 的 DataFrame 是带行列标签的表格：筛选、分组统计、排序都只需一行代码。</p>`,
        code: `import pandas as pd

df = pd.DataFrame({
    "姓名": ["小明", "小红", "小刚", "小丽"],
    "班级": ["一班", "一班", "二班", "二班"],
    "成绩": [90, 95, 78, 88],
})
print(df[df["成绩"] >= 85])
print(df.groupby("班级")["成绩"].mean())
print(df.sort_values("成绩", ascending=False).head(2))`,
      },
      {
        id: "l-matplotlib", title: "Matplotlib 绘图",
        body: `<p>Matplotlib 绘制折线图、柱状图等。离线环境中把图片保存为文件；Windows 版可直接弹出窗口显示。</p>`,
        code: `import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

xs = list(range(1, 8))
ys = [x * x for x in xs]
plt.plot(xs, ys, marker="o")
plt.title("y = x^2")
plt.savefig("chart.png")
print("已保存 chart.png")`,
      },
    ],
  },

  // ======================================================================== 实战应用
  {
    stage: "实战应用", hours: 35,
    topics: ["离线爬虫（本地教学网站）", "自动化脚本", "数据处理", "项目开发"],
    lessons: [
      {
        id: "l-crawler", title: "离线爬虫：解析本地 HTML",
        body: `
<p>严格离线模式下不访问互联网，而是解析内置的 HTML 样本。这里用标准库 <code>html.parser</code> 提取标题和链接。</p>`,
        code: `from html.parser import HTMLParser

PAGE = """
<html><body>
  <h1>Python Nexus 新闻</h1>
  <a href="/news/1">离线 IDE 发布</a>
  <a href="/news/2">流程图功能上线</a>
</body></html>
"""

class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self._href = None

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self._href = dict(attrs).get("href")

    def handle_data(self, data):
        if self._href and data.strip():
            self.links.append((data.strip(), self._href))
            self._href = None

p = LinkParser()
p.feed(PAGE)
for title, href in p.links:
    print(title, "->", href)`,
      },
      {
        id: "l-requests", title: "requests：访问离线教学网站",
        body: `
<p>应用内置了一个教学网站 <code>http://nexus.local</code>（新闻列表、商品表格、JSON 接口、登录页），飞行模式下也能练习 <code>requests</code>。</p>
<p>先查看 <code>robots.txt</code>——遵守网站的爬取规则是爬虫的基本礼仪。</p>`,
        code: `import requests

r = requests.get("http://nexus.local/robots.txt")
print(r.status_code)
print(r.text)

r = requests.get("http://nexus.local/news", params={"page": 1})
print(r.url, r.status_code, r.headers["Content-Type"])
print(r.text[:200])`,
      },
      {
        id: "l-pagination", title: "爬取分页列表",
        body: `<p>列表通常分页显示。找到「下一页」链接并循环请求，直到没有下一页为止。这里用 BeautifulSoup 提取每条新闻的标题、作者和阅读数。</p>`,
        code: `import requests
from bs4 import BeautifulSoup

url = "http://nexus.local/news"
items = []
while url:
    soup = BeautifulSoup(requests.get(url).text, "html.parser")
    for li in soup.select(".news-item"):
        items.append((li.select_one(".title").text, li.select_one(".author").text, int(li.select_one(".views").text)))
    nxt = soup.select_one(".next")
    url = "http://nexus.local" + nxt["href"] if nxt else None

print("共", len(items), "条")
for title, author, views in sorted(items, key=lambda x: -x[2])[:3]:
    print(views, title, author)`,
        practice: "cr-titles",
      },
      {
        id: "l-api", title: "JSON 接口与登录会话",
        body: `<p>很多网站通过 JSON 接口提供数据，比解析 HTML 更简单。需要登录的页面使用 <code>requests.Session()</code> 自动保存 Cookie。</p>`,
        code: `import requests

data = requests.get("http://nexus.local/api/products", params={"category": "音频", "size": 10}).json()
for p in data["items"]:
    print(p["name"], p["price"])

s = requests.Session()
print(s.get("http://nexus.local/profile").status_code)   # 未登录：403
s.post("http://nexus.local/login", data={"username": "student", "password": "python123"})
print(s.get("http://nexus.local/profile").status_code)   # 已登录：200`,
        practice: "cr-api",
      },
      {
        id: "l-automation", title: "自动化：批量整理文件",
        body: `<p>自动化脚本把重复劳动交给程序。下面的脚本先生成一批测试文件，再按扩展名把它们分类移动到不同目录，并生成报告。</p>`,
        code: `from pathlib import Path
from collections import Counter

inbox = Path("inbox")
inbox.mkdir(exist_ok=True)
for name in ["报告.docx", "照片1.jpg", "照片2.jpg", "数据.csv", "笔记.txt"]:
    (inbox / name).write_text("demo", encoding="utf-8")

moved = Counter()
for f in inbox.iterdir():
    if f.is_file():
        target = inbox / f.suffix.lstrip(".")
        target.mkdir(exist_ok=True)
        f.rename(target / f.name)
        moved[f.suffix] += 1

for folder in sorted(p for p in inbox.iterdir() if p.is_dir()):
    print(folder.name, [x.name for x in folder.iterdir()])
print(dict(moved))`,
      },
      {
        id: "l-data", title: "数据处理：销售报表",
        body: `<p>综合运用 csv、字典和排序，从原始销售记录中统计各类别销售额，并输出排行榜。</p>`,
        code: `import csv, io

RAW = """日期,商品,类别,数量,单价
2026-11-01,机械键盘,外设,2,399
2026-11-01,降噪耳机,音频,1,899
2026-11-02,无线鼠标,外设,5,129
2026-11-02,蓝牙音箱,音频,3,199
2026-11-03,扩展坞,配件,4,259"""

by_cat = {}
for row in csv.DictReader(io.StringIO(RAW)):
    amount = int(row["数量"]) * float(row["单价"])
    by_cat[row["类别"]] = by_cat.get(row["类别"], 0) + amount

for rank, (cat, amount) in enumerate(sorted(by_cat.items(), key=lambda x: -x[1]), 1):
    print(f"{rank}. {cat:<4} {amount:>10,.2f}")`,
      },
      {
        id: "l-project", title: "项目实战：待办事项管理",
        body: `
<p>一个完整的小项目：<code>todo.py</code> 实现数据模型与 JSON 持久化，<code>main.py</code> 是命令行入口，<code>tests/</code> 中是单元测试。</p>
<p>打开后先点「🧪 测试」，再运行本文件。试着给 <code>TodoList</code> 增加「按优先级排序」功能，并补充测试。</p>`,
        code: `from todo import TodoList

todos = TodoList("todos.json")
todos.add("学习 Python 函数")
todos.add("完成二分查找练习", priority=2)
todos.add("整理笔记")
todos.done(1)
todos.save()

for item in TodoList("todos.json").items:
    mark = "✓" if item["done"] else " "
    print(f"[{mark}] #{item['id']} {item['title']} (P{item['priority']})")`,
        files: {
          "todo.py": `import json
import os


class TodoList:
    def __init__(self, path):
        self.path = path
        self.items = []
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                self.items = json.load(f)

    def add(self, title, priority=1):
        next_id = max((i["id"] for i in self.items), default=0) + 1
        self.items.append({"id": next_id, "title": title, "priority": priority, "done": False})
        return next_id

    def done(self, item_id):
        for item in self.items:
            if item["id"] == item_id:
                item["done"] = True
                return True
        return False

    def pending(self):
        return [i for i in self.items if not i["done"]]

    def save(self):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self.items, f, ensure_ascii=False, indent=2)
`,
          "tests/test_todo.py": `import os
import tempfile
import unittest

from todo import TodoList


class TestTodo(unittest.TestCase):
    def setUp(self):
        self.path = os.path.join(tempfile.mkdtemp(), "t.json")

    def test_add_and_done(self):
        t = TodoList(self.path)
        a = t.add("a")
        t.add("b")
        self.assertTrue(t.done(a))
        self.assertEqual([i["title"] for i in t.pending()], ["b"])

    def test_persistence(self):
        t = TodoList(self.path)
        t.add("x", priority=3)
        t.save()
        self.assertEqual(TodoList(self.path).items[0]["priority"], 3)
`,
        },
      },
    ],
  },
];
