// --- Core ext-types ---

import { Observable, Observer, Subject } from 'rxjs'
import { filter } from 'rxjs/operators'

type Serializable = Object | Array<any> | number | string | boolean | Date | void;

type Value = number | string | boolean | Date;

export interface Message<TData extends Serializable> {
  type: string;
  data?: TData;
}

type ISubject<T> = Observer<T> & Observable<T>;

export class ChannelTopic<TData extends Serializable> {
  type: string
  channel: ISubject<Message<TData>>

  constructor(channel: ISubject<Message<TData>>, type: string) {
    this.channel = channel
    this.type = type
  }

  subscribe(observer: (message: Message<TData>) => void) {
    this.observe().subscribe(observer)
  }

  sub(observer: (data: TData) => void) {
    this.observe().subscribe(m => observer(m.data))
  }

  dispatch(data?: TData) {
    this.channel.next({
      type: this.type,
      data: data,
    })
  }

  observe(): Observable<Message<TData>> {
    return this.channel.pipe(filter(m => m.type === this.type))
  }

  forward(channel: ChannelTopic<TData>) {
    this.subscribe(m => channel.dispatch(m.data))
  }
}

export class Channel {
  type: string
  private subject: ISubject<Message<Serializable>>

  constructor(subject?: ISubject<Message<Serializable>>, type?: string) {
    this.subject = subject || new Subject<Message<Serializable>>()
    this.type = type
  }

  subscribe(onNext?: (value: Message<Serializable>) => void) {
    return this.subject.subscribe(onNext)
  }

  observe() {
    return this.subject
  }

  topic<TData extends Serializable>(type: string): ChannelTopic<TData> {
    return new ChannelTopic<TData>(this.subject as ISubject<Message<TData>>,
      this.type ? this.type + '.' + type : type)
  }

  mergeTyped<TData extends Serializable>(...topics: ChannelTopic<TData>[])
    : Observable<Message<TData>> {
    const types = topics.map(t => t.type)
    return this.subject.pipe(filter(m => types.indexOf(m.type) >= 0)) as Observable<Message<TData>>
  }

  merge(...topics: ChannelTopic<Serializable>[])
    : Observable<Message<Serializable>> {
    const types = topics.map(t => t.type)
    return this.subject.pipe(filter(m => types.indexOf(m.type) >= 0))
  }
}
